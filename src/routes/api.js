const express = require("express");
const router = express.Router();
const db = require("../db");

function periodToSql(period) {
  if (period === "3m") return "INTERVAL 3 MONTH";
  if (period === "6m") return "INTERVAL 6 MONTH";
  return "INTERVAL 1 YEAR";
}

router.get("/stores/performance", async (req, res) => {
  const period = req.query.period || "3m";
  const interval = periodToSql(period);

  
  const sql = `
    SELECT
      m.magaza_id,
      m.magaza_adi,
      m.adres,
      m.lat, m.lng,
      SUM(s.adet * u.urun_fiyat) AS ciro
    FROM magaza m
    JOIN siparisler s ON s.magaza_id = m.magaza_id
    JOIN urunler u ON u.urun_id = s.urun_id
    WHERE m.lat IS NOT NULL AND m.lng IS NOT NULL
      AND s.siparis_tarihi >= DATE_SUB(CURDATE(), ${interval})
    GROUP BY m.magaza_id, m.magaza_adi, m.adres, m.lat, m.lng
    ORDER BY ciro DESC;
  `;

  const [rows] = await db.query(sql);
  res.json(rows);
});


router.get("/heatmap", async (req, res) => {
  const period = req.query.period || "3m";
  const interval = periodToSql(period);

  const sql = `
    SELECT
      s.musteri_lat AS lat,
      s.musteri_lng AS lng,
      (s.adet * u.urun_fiyat) AS weight
    FROM siparisler s
    JOIN urunler u ON u.urun_id = s.urun_id
    WHERE s.musteri_lat IS NOT NULL AND s.musteri_lng IS NOT NULL
      AND s.siparis_tarihi >= DATE_SUB(CURDATE(), ${interval});
  `;

  const [rows] = await db.query(sql);
  
  const points = rows.map(r => [Number(r.lat), Number(r.lng), Number(r.weight)]);
  res.json(points);
});

router.get("/stores/missing", async (req, res) => {
  const sql = `
    SELECT magaza_id, magaza_adi, adres, lat, lng
    FROM magaza
    WHERE lat IS NULL OR lng IS NULL;
  `;
  const [rows] = await db.query(sql);
  res.json(rows);
});


router.get("/stores/:id/trend", async (req, res) => {
  try {
    const storeId = Number(req.params.id);
    const period = (req.query.period || "1y").toLowerCase();

    const interval =
      period === "3m" ? "INTERVAL 3 MONTH" :
      period === "6m" ? "INTERVAL 6 MONTH" :
      "INTERVAL 1 YEAR";

    const [rows] = await db.query(
      `
      SELECT
        DATE_FORMAT(s.siparis_tarihi, '%Y-%m') AS label,
        SUM(s.adet * u.urun_fiyat) AS ciro
      FROM siparisler s
      JOIN urunler u ON u.urun_id = s.urun_id
      WHERE s.magaza_id = ?
        AND s.siparis_tarihi >= DATE_SUB(CURDATE(), ${interval})
      GROUP BY DATE_FORMAT(s.siparis_tarihi, '%Y-%m')
      ORDER BY label ASC
      `,
      [storeId]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "stores/:id/trend failed", detail: String(err) });
  }
});



router.get("/stores/:id/top-products", async (req, res) => {
  const storeId = req.params.id;
  const period = req.query.period || "3m";
  const interval = periodToSql(period);

  const sql = `
    SELECT
      u.urun_ad,
      SUM(s.adet) AS adet,
      SUM(s.adet * u.urun_fiyat) AS ciro
    FROM siparisler s
    JOIN urunler u ON u.urun_id = s.urun_id
    WHERE s.magaza_id = ?
      AND s.siparis_tarihi >= DATE_SUB(CURDATE(), ${interval})
    GROUP BY u.urun_id, u.urun_ad
    ORDER BY ciro DESC
    LIMIT 10;
  `;

  const [rows] = await db.query(sql, [storeId]);
  res.json(rows);
});

router.get("/stores/:id/benchmark", async (req, res) => {
  try {
    const storeId = Number(req.params.id);
    const period = req.query.period || "3m";
    const interval = periodToSql(period);

    
    const [targetRows] = await db.query(
      `
      SELECT
        m.magaza_id, m.magaza_adi, m.lat, m.lng,
        mh.mahalle_id, mh.mahalle_ad, mh.nufus
      FROM magaza m
      LEFT JOIN mahalleler mh ON mh.mahalle_id = m.mahalle_id
      WHERE m.magaza_id = ?
      LIMIT 1;
      `,
      [storeId]
    );

    if (!targetRows.length) {
      return res.status(404).json({ error: "Store not found" });
    }
    const target = targetRows[0];

    if (target.lat == null || target.lng == null) {
      return res.status(400).json({ error: "Target store has no coordinates (lat/lng)" });
    }

    
    const [nearRows] = await db.query(
      `
      SELECT
        m2.magaza_id,
        m2.magaza_adi,
        m2.lat, m2.lng,
        mh2.mahalle_ad,
        mh2.nufus AS mahalle_nufus,
        ST_Distance_Sphere(
          POINT(m1.lng, m1.lat),
          POINT(m2.lng, m2.lat)
        ) AS distance_m
      FROM magaza m1
      JOIN magaza m2 ON m2.magaza_id <> m1.magaza_id
      LEFT JOIN mahalleler mh2 ON mh2.mahalle_id = m2.mahalle_id
      WHERE m1.magaza_id = ?
        AND m2.lat IS NOT NULL AND m2.lng IS NOT NULL
      ORDER BY distance_m ASC
      LIMIT 3;
      `,
      [storeId]
    );

    
    const ids = [storeId, ...nearRows.map(r => r.magaza_id)];
    const placeholders = ids.map(() => "?").join(",");

    const [ciroRows] = await db.query(
      `
      SELECT
        s.magaza_id,
        SUM(s.adet * u.urun_fiyat) AS ciro
      FROM siparisler s
      JOIN urunler u ON u.urun_id = s.urun_id
      WHERE s.magaza_id IN (${placeholders})
        AND s.siparis_tarihi >= DATE_SUB(CURDATE(), ${interval})
      GROUP BY s.magaza_id;
      `,
      ids
    );

    const ciroMap = new Map(ciroRows.map(r => [Number(r.magaza_id), Number(r.ciro || 0)]));

    const targetCiro = ciroMap.get(storeId) || 0;

    const neighbors = nearRows.map(r => ({
      magaza_id: r.magaza_id,
      magaza_adi: r.magaza_adi,
      distance_m: Math.round(Number(r.distance_m)),
      mahalle_ad: r.mahalle_ad,
      mahalle_nufus: r.mahalle_nufus == null ? null : Number(r.mahalle_nufus),
      ciro: ciroMap.get(Number(r.magaza_id)) || 0,
    }));

    const avgNearest3Ciro =
      neighbors.length ? neighbors.reduce((a, b) => a + b.ciro, 0) / neighbors.length : 0;

    const neighborPops = neighbors
      .map(x => x.mahalle_nufus)
      .filter(x => x != null);

    const avgNearest3Pop =
      neighborPops.length ? neighborPops.reduce((a, b) => a + b, 0) / neighborPops.length : null;

    const targetPop = target.nufus == null ? null : Number(target.nufus);

    
    const ciroRatio = avgNearest3Ciro > 0 ? targetCiro / avgNearest3Ciro : null;

    let recommendation = "Pazarlamaya Gerek Yok";
    let reason = "Eşiklere göre pazarlama önerisi oluşmadı.";

    if (ciroRatio != null && targetPop != null && avgNearest3Pop != null) {
      if (ciroRatio < 0.7 && targetPop > avgNearest3Pop) {
        recommendation = "Pazarlama Yapılabilir";
        reason = "Ciro komşu ortalamasına göre düşük, nüfus komşu ortalamasına göre yüksek.";
      }
    } else {
      reason = "Nüfus veya ciro verisi eksik olduğu için karar sınırlı.";
    }

    res.json({
      meta: { period },
      target: {
        magaza_id: target.magaza_id,
        magaza_adi: target.magaza_adi,
        mahalle_ad: target.mahalle_ad,
        mahalle_nufus: targetPop,
        ciro: targetCiro,
      },
      neighbors,
      benchmark: {
        avgNearest3Ciro,
        avgNearest3Pop,
        ciroRatio,
      },
      recommendation,
      reason,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "benchmark failed", detail: String(err) });
  }
});

router.get("/mahalle/list", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT mahalle_id, mahalle_ad, nufus
       FROM mahalleler
       WHERE mahalle_ad IS NOT NULL
       ORDER BY mahalle_ad ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "mahalle/list failed", detail: String(err) });
  }
});

router.get("/mahalle/new-store-decision", async (req, res) => {
  try {
    const mahalleId = Number(req.query.mahalle_id);
    const period = req.query.period || "3m";

    const interval =
      period === "3m" ? "INTERVAL 3 MONTH" :
      period === "6m" ? "INTERVAL 6 MONTH" :
      "INTERVAL 1 YEAR";

    
    const POP_TH = 20000;     
    const CIRO_TH = 250000;   
    const DIST_TH = 1500;     
    const RADIUS = 1500;      

    
    const [mRows] = await db.query(
      `SELECT mahalle_id, mahalle_ad, nufus
       FROM mahalleler
       WHERE mahalle_id = ?
       LIMIT 1`,
      [mahalleId]
    );
    if (!mRows.length) return res.status(404).json({ error: "Mahalle not found" });
    const mahalle = mRows[0];

    
    const [sRows] = await db.query(
      `
      SELECT
        AVG(s.musteri_lat) AS center_lat,
        AVG(s.musteri_lng) AS center_lng,
        COALESCE(SUM(s.adet * u.urun_fiyat), 0) AS ciro,
        COUNT(*) AS siparis_sayisi
      FROM siparisler s
      JOIN urunler u ON u.urun_id = s.urun_id
      WHERE UPPER(TRIM(s.musteri_mahalle)) = ?
        AND s.musteri_lat IS NOT NULL AND s.musteri_lng IS NOT NULL
        AND s.siparis_tarihi >= DATE_SUB(CURDATE(), ${interval})
      `,
      [String(mahalle.mahalle_ad).toUpperCase().trim()]
    );

    const stats = sRows[0];
    const centerLat = stats.center_lat == null ? null : Number(stats.center_lat);
    const centerLng = stats.center_lng == null ? null : Number(stats.center_lng);
    const ciro = Number(stats.ciro || 0);
    const siparisSayisi = Number(stats.siparis_sayisi || 0);

    
    if (centerLat == null || centerLng == null) {
      return res.json({
        mahalle,
        period,
        stats: { ciro, siparisSayisi, centerLat, centerLng },
        decision: "KARAR VERİLEMEDİ",
        badge: "WARN",
        reason: "Bu mahalle için müşteri koordinatı bulunamadı (musteri_lat/lng yok).",
        thresholds: { POP_TH, CIRO_TH, DIST_TH, RADIUS }
      });
    }

    
    const [nearRows] = await db.query(
      `
      SELECT
        MIN(ST_Distance_Sphere(POINT(?, ?), POINT(m.lng, m.lat))) AS nearest_dist_m,
        SUM(
          ST_Distance_Sphere(POINT(?, ?), POINT(m.lng, m.lat)) <= ?
        ) AS stores_within_radius
      FROM magaza m
      WHERE m.lat IS NOT NULL AND m.lng IS NOT NULL
      `,
      [centerLng, centerLat, centerLng, centerLat, RADIUS]
    );

    const nearestDist = nearRows[0].nearest_dist_m == null ? null : Number(nearRows[0].nearest_dist_m);
    const storesWithin = Number(nearRows[0].stores_within_radius || 0);
    const pop = mahalle.nufus == null ? null : Number(mahalle.nufus);

    
    const checks = {
      pop_ok: pop != null && pop >= POP_TH,
      ciro_ok: ciro >= CIRO_TH,
      dist_ok: nearestDist != null && nearestDist >= DIST_TH,
      no_store_near: storesWithin === 0
    };

    let decision = "AÇILAMAZ";
    let badge = "BAD";
    let reason = [];

    if (!checks.pop_ok) reason.push("Nüfus eşiğin altında.");
    if (!checks.ciro_ok) reason.push("Ciro eşiğin altında.");
    if (!checks.dist_ok) reason.push("Yakında mağaza var (mesafe düşük).");
    if (!checks.no_store_near) reason.push("1500m içinde mağaza mevcut.");

    if (checks.pop_ok && checks.ciro_ok && checks.dist_ok && checks.no_store_near) {
      decision = "YENİ MAĞAZA AÇILABİLİR";
      badge = "GOOD";
      reason = ["Nüfus ve ciro yüksek, yakın çevrede mağaza yok/uzak."];
    }

    res.json({
      mahalle,
      period,
      stats: {
        ciro,
        siparisSayisi,
        centerLat,
        centerLng,
        nearestDistM: nearestDist,
        storesWithin
      },
      decision,
      badge,
      reason: reason.join(" "),
      thresholds: { POP_TH, CIRO_TH, DIST_TH, RADIUS }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "mahalle/new-store-decision failed", detail: String(err) });
  }
});



module.exports = router;
