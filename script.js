const $ = id => document.getElementById(id);

const sunPosition = $("sunPosition");
const manualAngle = $("manualAngle");
const autoTrack = $("autoTrack");
const irradiance = $("irradiance");
const temperature = $("temperature");
const area = $("area");

let panelAngle = Number(manualAngle.value);
let history = [];

const chart = new Chart($("powerChart"), {
  type: "line",
  data: {
    labels: [],
    datasets: [{
      label: "Modeled power (W)",
      data: [],
      tension: 0.35,
      fill: true
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { labels: { color: "#edf6ff" } }
    },
    scales: {
      x: { ticks: { color: "#8fa6bf" }, grid: { color: "#233b55" } },
      y: { ticks: { color: "#8fa6bf" }, grid: { color: "#233b55" }, beginAtZero: true }
    }
  }
});

function sensorReadings(sun, panel) {
  const error = sun - panel;

  // Four virtual LDRs. The top/bottom pair is given a smaller
  // vertical component so the array still behaves like a 2-axis sensor.
  const horizontal = Math.max(-1, Math.min(1, error / 45));
  const vertical = Math.sin((sun - 45) * Math.PI / 180) * 0.45;

  const base = 70 + Number(irradiance.value) / 1200 * 25;
  const tl = base + horizontal * 25 + vertical * 12;
  const tr = base - horizontal * 25 + vertical * 12;
  const bl = base + horizontal * 25 - vertical * 12;
  const br = base - horizontal * 25 - vertical * 12;

  return {
    tl: Math.max(0, Math.min(100, tl)),
    tr: Math.max(0, Math.min(100, tr)),
    bl: Math.max(0, Math.min(100, bl)),
    br: Math.max(0, Math.min(100, br))
  };
}

function setSensor(id, bar, value) {
  $(id).textContent = value.toFixed(0);
  $(bar).style.width = `${value}%`;
}

function update() {
  const sun = Number(sunPosition.value);
  const irr = Number(irradiance.value);
  const temp = Number(temperature.value);
  const panelArea = Number(area.value);

  // Automatic controller: move a small amount toward the sun each update.
  if (autoTrack.checked) {
    const difference = sun - panelAngle;
    if (Math.abs(difference) > 0.4) {
      panelAngle += Math.sign(difference) * Math.min(2.5, Math.abs(difference));
    }
    manualAngle.value = panelAngle;
  } else {
    panelAngle = Number(manualAngle.value);
  }

  const trackingError = Math.abs(sun - panelAngle);
  const angularFactor = Math.max(0, Math.cos(trackingError * Math.PI / 180));

  const baseEfficiency = 0.20;
  const temperatureFactor = Math.max(0.75, 1 - 0.004 * (temp - 25));
  const finalEfficiency = baseEfficiency * angularFactor * temperatureFactor;

  const idealPower = irr * panelArea * baseEfficiency * angularFactor;
  const generatedPower = irr * panelArea * finalEfficiency;
  const thermalLoss = Math.max(0, idealPower - generatedPower);
  const cellTemp = temp + (irr / 800) * 12;

  $("power").textContent = `${Math.round(generatedPower)} W`;
  $("efficiency").textContent = `${(finalEfficiency * 100).toFixed(1)}%`;
  $("trackingError").textContent = `${trackingError.toFixed(1)}°`;
  $("thermalLoss").textContent = `${Math.round(thermalLoss)} W`;

  $("sunPositionValue").textContent = sun;
  $("manualAngleValue").textContent = Math.round(panelAngle);
  $("irradianceValue").textContent = irr;
  $("temperatureValue").textContent = temp;
  $("areaValue").textContent = panelArea.toFixed(1);

  $("sunAngleReadout").textContent = `${sun.toFixed(0)}°`;
  $("panelAngleReadout").textContent = `${panelAngle.toFixed(1)}°`;
  $("errorReadout").textContent = `${trackingError.toFixed(1)}°`;

  $("calcIrr").textContent = `${irr} W/m²`;
  $("calcArea").textContent = `${panelArea.toFixed(1)} m²`;
  $("tempFactor").textContent = `${(temperatureFactor * 100).toFixed(1)}%`;
  $("cellTemperature").textContent = `${cellTemp.toFixed(1)} °C`;
  $("efficiencyBar").style.width = `${Math.min(100, finalEfficiency * 500)}%`;

  // Move the visual sun along an arc.
  const normalized = sun / 90;
  $("sun").style.left = `${38 + normalized * 48}%`;
  $("sun").style.top = `${38 + (1 - Math.sin(normalized * Math.PI)) * 95}px`;

  // Rotate the visual panel.
  const rotation = (panelAngle - 45) * 0.55 - 8;
  $("panelFrame").style.transform =
    `translateX(-50%) rotateZ(${rotation}deg)`;

  // Status.
  const status = $("trackerStatus");
  if (trackingError < 2) {
    status.textContent = "ALIGNED";
    status.style.color = "#4ade80";
  } else if (trackingError < 8) {
    status.textContent = "CORRECTING";
    status.style.color = "#fbbf24";
  } else {
    status.textContent = "MISALIGNED";
    status.style.color = "#fb7185";
  }

  // Sensor layer.
  const s = sensorReadings(sun, panelAngle);
  setSensor("ldrTL", "barTL", s.tl);
  setSensor("ldrTR", "barTR", s.tr);
  setSensor("ldrBL", "barBL", s.bl);
  setSensor("ldrBR", "barBR", s.br);

  $("interpretation").textContent =
    `With ${irr} W/m² irradiance and a ${panelArea.toFixed(1)} m² panel, the model estimates ${Math.round(generatedPower)} W. ` +
    `The tracker error is ${trackingError.toFixed(1)}°, while the temperature factor is ${(temperatureFactor * 100).toFixed(1)}%.`;

  history.push(Math.round(generatedPower));
  if (history.length > 40) history.shift();

  chart.data.labels = history.map((_, i) => i + 1);
  chart.data.datasets[0].data = history;
  chart.update("none");
}

autoTrack.addEventListener("change", () => {
  $("manualControl").classList.toggle("disabled", autoTrack.checked);
  $("modeText").textContent = autoTrack.checked ? "AUTOMATIC TRACKING" : "MANUAL TRACKING";
  $("modeDot").style.background = autoTrack.checked ? "#4ade80" : "#fbbf24";
});

document.querySelectorAll("input").forEach(input => {
  input.addEventListener("input", update);
});

$("clearChart").addEventListener("click", () => {
  history = [];
  chart.data.labels = [];
  chart.data.datasets[0].data = [];
  chart.update();
});

update();
