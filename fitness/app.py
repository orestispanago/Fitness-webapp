from flask import Flask, redirect, render_template, url_for

from fitness import db
from fitness.queries import daily, running, strength

app = Flask(__name__)
db.init_app(app)


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
    progress = strength.load_strength_progress()
    groups = strength.load_exercise_trends()
    return render_template("strength.html", progress=progress, groups=groups)
