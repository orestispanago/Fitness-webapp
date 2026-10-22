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
    return render_template("fitness.html", vo2max=vo2max)
