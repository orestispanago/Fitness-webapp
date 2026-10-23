from flask import Flask, redirect, render_template, url_for

from fitness import db, queries

app = Flask(__name__)
db.init_app(app)


@app.route("/")
def index():
    return redirect(url_for("fitness_page"))


@app.route("/fitness")
def fitness_page():
    vo2max = queries.load_vo2max()
    resting_hr = queries.load_resting_hr()
    hrv = queries.load_hrv()
    weight = queries.load_weight()
    sleep_shortfall = queries.load_sleep_shortfall()
    acwr = queries.load_acwr()
    return render_template(
        "fitness.html",
        vo2max=vo2max,
        resting_hr=resting_hr,
        hrv=hrv,
        weight=weight,
        sleep_shortfall=sleep_shortfall,
        acwr=acwr,
    )


@app.route("/running")
def running_page():
    pace = queries.load_run_pace()
    run_hr = queries.load_run_hr()
    pace_fade = queries.load_pace_fade()
    return render_template(
        "running.html",
        pace=pace,
        run_hr=run_hr,
        pace_fade=pace_fade,
    )
