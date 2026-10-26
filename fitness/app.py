import os
from datetime import datetime

from flask import Flask, flash, redirect, render_template, request, url_for

from fitness import db
from fitness.queries import daily, running, strength
from fitness.sync import main as run_sync

app = Flask(__name__)
# Only signs flash messages, so a new key per start is fine (see SPEC.md)
app.secret_key = os.urandom(24)
db.init_app(app)


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
    resting_hr_avg = daily.compute_rolling_average(resting_hr)
    hrv_avg = daily.compute_rolling_average(hrv)
    hrv_baseline = daily.load_hrv_baseline()
    weight = daily.load_weight()
    weight_avg = daily.compute_rolling_average(weight)
    sleep_shortfall = daily.load_sleep_shortfall()
    sleep_shortfall_avg = daily.compute_rolling_average(sleep_shortfall)
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
        sleep_shortfall=sleep_shortfall,
        sleep_shortfall_avg=sleep_shortfall_avg,
        acwr=acwr,
    )


@app.route("/running")
def running_page():
    pace = running.load_run_pace()
    decoupling = running.load_decoupling()
    metres_per_beat = running.load_metres_per_beat()
    return render_template(
        "running.html",
        pace=pace,
        decoupling=decoupling,
        metres_per_beat=metres_per_beat,
    )


@app.route("/strength")
def strength_page():
    groups = strength.load_exercise_trends()
    return render_template("strength.html", groups=groups)


@app.route("/sync", methods=["POST"])
def sync():
    try:
        run_sync()
        flash(f"Synced at {datetime.now():%H:%M}", "success")
    except Exception as error:
        app.logger.exception("Sync failed")
        flash(f"Sync failed: {error}", "error")
    target = request.form.get("next", "")
    if not is_local_path(target):
        target = url_for("index")
    return redirect(target)
