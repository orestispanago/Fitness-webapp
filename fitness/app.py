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
    sleep = queries.load_sleep()
    acwr = queries.load_acwr()
    return render_template(
        "fitness.html",
        vo2max=vo2max,
        resting_hr=resting_hr,
        hrv=hrv,
        weight=weight,
        sleep=sleep,
        acwr=acwr,
    )
