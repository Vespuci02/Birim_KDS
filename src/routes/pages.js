const db = require("../db");
const express = require("express");
const router = express.Router();

router.get("/dashboard", (req, res) => {
  res.render("dashboard");
});

router.get("/stores/:id", async (req, res) => {
  const storeId = req.params.id;

  const [rows] = await db.query(
    "SELECT magaza_adi FROM magaza WHERE magaza_id = ? LIMIT 1",
    [storeId]
  );

  const storeName = rows.length ? rows[0].magaza_adi : `Mağaza ${storeId}`;
  res.render("store", { storeId, storeName });
});


module.exports = router;
