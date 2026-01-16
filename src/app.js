
require("dotenv").config();
const express = require("express");
const path = require("path");

const pagesRouter = require("./routes/pages");
const apiRouter = require("./routes/api");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use("/public", express.static(path.join(__dirname, "public")));

app.use("/", pagesRouter);
app.use("/api", apiRouter);

app.get("/", (req, res) => res.redirect("/dashboard"));

const port = Number(process.env.PORT) || 3000;


app.listen(port, "127.0.0.1", () => {
  console.log(`Server running: http://127.0.0.1:${port}`);
});
