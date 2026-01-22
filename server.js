const express = require("express");
const path = require("path");

const app = express();

// Serve static frontend files
app.use(express.static(path.join(__dirname, "public")));

// Fallback route (important for refresh / direct links)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
