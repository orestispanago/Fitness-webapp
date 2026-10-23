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
    resting_hr_avg = queries.rolling_average(resting_hr)
    hrv_avg = queries.rolling_average(hrv)
    hrv_baseline = queries.load_hrv_baseline()
    weight = queries.load_weight()
    weight_avg = queries.rolling_average(weight)
    sleep_shortfall = queries.load_sleep_shortfall()
    sleep_shortfall_avg = queries.rolling_average(sleep_shortfall)
    acwr = queries.load_acwr()
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
    pace = queries.load_run_pace()
    decoupling = queries.load_decoupling()
    metres_per_beat = queries.load_metres_per_beat()
    return render_template(
        "running.html",
        pace=pace,
        decoupling=decoupling,
        metres_per_beat=metres_per_beat,
    )
