import hmac
from datetime import timedelta

from flask import Flask, redirect, render_template, request, session, url_for

from fitness import db
from fitness.config import APP_PASSWORD, APP_USER, SECRET_KEY
from fitness.queries import daily, running, strength
from fitness.sync import main as run_sync

if not (APP_USER and APP_PASSWORD and SECRET_KEY):
    raise RuntimeError("Set APP_USER, APP_PASSWORD and SECRET_KEY in .env")

app = Flask(__name__)
app.secret_key = SECRET_KEY
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=30)
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
db.init_app(app)


def check_credentials(username, password):
    user_matches = hmac.compare_digest(username.encode(), APP_USER.encode())
    password_matches = hmac.compare_digest(password.encode(), APP_PASSWORD.encode())
    return user_matches and password_matches


@app.before_request
def require_login():
    response = None
    if request.endpoint not in ("login", "static") and not session.get("logged_in"):
        response = redirect(url_for("login"))
    return response


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        response = render_template("login.html")
    elif check_credentials(request.form["username"], request.form["password"]):
        session.clear()
        session["logged_in"] = True
        session.permanent = True
        response = redirect(url_for("fitness_page"))
    else:
        response = (render_template("login.html", error=True), 401)
    return response


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return redirect(url_for("login"))


def is_local_path(path):
    local = False
    if path.startswith("/") and not path.startswith(("//", "/\\")):
        local = True
    return local


@app.route("/")
def index():
    return redirect(url_for("fitness_page"))


@app.route("/fitness")
def fitness_page():
    vo2max = daily.load_vo2max()
    resting_hr = daily.load_resting_hr()
    hrv = daily.load_hrv()
    resting_hr_avg = daily.calc_7day_rolling_mean(resting_hr)
    hrv_avg = daily.calc_7day_rolling_mean(hrv)
    hrv_baseline = daily.load_hrv_baseline()
    weight = daily.load_weight()
    weight_avg = daily.calc_7day_rolling_mean(weight)
    weight_trend = daily.calc_weight_change_per_month(weight)
    sleep_shortfall = daily.load_sleep_shortfall()
    sleep_shortfall_avg = daily.calc_7day_rolling_mean(sleep_shortfall)
    acwr = daily.load_acwr()
    return render_template(
        "fitness.html",
        vo2max=vo2max,
        resting_hr=resting_hr,
        resting_hr_avg=resting_hr_avg,
        hrv=hrv,
        hrv_avg=hrv_avg,
        hrv_baseline=hrv_baseline,
        weight=weight,
        weight_avg=weight_avg,
        weight_trend=weight_trend,
        sleep_shortfall=sleep_shortfall,
        sleep_shortfall_avg=sleep_shortfall_avg,
        acwr=acwr,
    )


@app.route("/running")
def running_page():
    pace = running.load_run_pace()
    metres_per_beat = running.load_metres_per_beat()
    return render_template(
        "running.html",
        pace=pace,
        metres_per_beat=metres_per_beat,
    )


@app.route("/strength")
def strength_page():
    rows = strength.load_strength_sets()
    labels = strength.list_session_labels(rows)
    last_dates = strength.get_latest_dates(rows, labels)
    selected = strength.choose_group(rows, labels, request.args.get("group"))
    group_rows = strength.filter_group_rows(rows, selected)
    exercises = strength.build_exercise_trends(group_rows)
    latest_date = strength.find_latest_date(group_rows)
    return render_template(
        "strength.html",
        labels=labels,
        last_dates=last_dates,
        selected=selected,
        exercises=exercises,
        latest_date=latest_date,
    )


@app.route("/sync", methods=["POST"])
def sync():
    run_sync()
    target = request.form.get("next", "")
    if not is_local_path(target):
        target = url_for("index")
    return redirect(target)
