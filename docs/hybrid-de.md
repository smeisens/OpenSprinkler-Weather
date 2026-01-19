# 📚 Hybrid Weather Provider - Datenfluss Dokumentation

## 🎯 Übersicht: Drei Arten von Wetterdaten

Der Hybrid Provider arbeitet mit **drei verschiedenen Datentypen**, die oft verwechselt werden:

### 1️⃣ **Current Weather** (Aktuelles Wetter - JETZT)
**Methode:** `getWeatherDataInternal()`  
**Quelle:** Lokale Wetterstation  
**Zeitraum:** Letzte 24 Stunden (für Durchschnitte)  
**Verwendet für:**
- Mobile App Anzeige ("Aktuelles Wetter")
- Rain Delay Entscheidungen
- "Regnet es JETZT gerade?"
- "Wie warm ist es JETZT?"

**Beispiel-Daten:**
```typescript
{
  temp: 18.5,           // Aktuelle Temperatur
  humidity: 75,         // Aktuelle Luftfeuchtigkeit
  raining: true,        // Regnet es JETZT?
  precip: 2.5,          // mm Regen in letzten 24h
  wind: 12,             // Aktueller Wind
  weatherProvider: "local"
}
```

**Wichtig:** Diese Daten sind **ECHTZEIT-MESSUNGEN** von deiner Station!

---

### 2️⃣ **Historical Data** (Historische Daten - VERGANGENHEIT)
**Methode:** `getWateringDataInternal()` von LocalProvider  
**Quelle:** Lokale Wetterstation  
**Zeitraum:** Letzte 7 Tage + heute bis jetzt  
**Verwendet für:**
- Zimmerman Watering Scale Berechnung
- Multi-Day Algorithmus
- Trend-Analyse

**Beispiel-Daten:**
```typescript
[
  {
    periodStartTime: 1736899200,  // 15. Jan 00:00
    temp: 16.2,                    // Tagesdurchschnitt
    humidity: 68,
    precip: 0,                     // Kein Regen an dem Tag
    minTemp: 12.5,
    maxTemp: 19.8,
    solarRadiation: 3.2,           // kWh/m²/Tag
    windSpeed: 8.5,
    weatherProvider: "local"
  },
  {
    periodStartTime: 1736985600,  // 16. Jan 00:00
    temp: 17.5,
    humidity: 72,
    precip: 5.2,                   // 5.2mm Regen!
    minTemp: 14.1,
    maxTemp: 21.3,
    solarRadiation: 2.1,           // Weniger Sonne (bewölkt)
    windSpeed: 10.2,
    weatherProvider: "local"
  },
  // ... weitere Tage ...
  {
    periodStartTime: 1737504000,  // 18. Jan 00:00 (HEUTE)
    temp: 18.2,                    // Durchschnitt 00:00-jetzt (18:00)
    humidity: 75,
    precip: 2.5,                   // Regen heute bisher
    minTemp: 16.5,
    maxTemp: 19.9,
    solarRadiation: 2.8,           // Bisher heute
    windSpeed: 9.1,
    weatherProvider: "local"
  }
]
```

**Wichtig:** Jeder Tag ist **GEMESSEN** von deiner Station - keine Vorhersagen!

---

### 3️⃣ **Forecast Data** (Vorhersage - ZUKUNFT)
**Methode:** `getWateringDataInternal()` von ForecastProvider  
**Quelle:** Apple Weather / OpenMeteo / etc.  
**Zeitraum:** Morgen bis +7 Tage  
**Verwendet für:**
- Zimmerman Watering Scale Berechnung
- Vorausschauende Bewässerungsplanung
- "Wie wird das Wetter die nächsten Tage?"

**Beispiel-Daten:**
```typescript
[
  {
    periodStartTime: 1737590400,  // 19. Jan 00:00 (MORGEN)
    temp: 20.5,                    // Vorhergesagte Durchschnittstemperatur
    humidity: 65,
    precip: 0,                     // Kein Regen erwartet
    minTemp: 17.2,
    maxTemp: 23.8,
    solarRadiation: 4.5,           // Sonnig erwartet
    windSpeed: 7.2,
    weatherProvider: "OpenMeteo"
  },
  {
    periodStartTime: 1737676800,  // 20. Jan 00:00
    temp: 22.1,
    humidity: 60,
    precip: 0,
    minTemp: 18.5,
    maxTemp: 25.7,
    solarRadiation: 5.1,
    windSpeed: 6.8,
    weatherProvider: "OpenMeteo"
  },
  // ... weitere Tage bis +7 ...
]
```

**Wichtig:** Diese Daten sind **VORHERSAGEN** - nicht gemessen!

---

## 🔄 Wie Hybrid diese kombiniert

### Scenario: 18. Januar, 18:00 Uhr

```typescript
// 1. OpenSprinkler App öffnen → Zeigt "Aktuelles Wetter"
const current = await hybrid.getWeatherDataInternal();
// → Zeigt: 18.2°C, 75% Luftfeuchtigkeit, es regnet (2.5mm heute)
// → Quelle: Lokale Station (ECHTZEIT)

// 2. Bewässerung planen → Zimmerman berechnen
const watering = await hybrid.getWateringDataWithForecastProvider(coords, pws, "OpenMeteo");
// → Gibt zurück:
[
  // GEMESSEN (Vergangenheit):
  { day: "11. Jan", temp: 15.2, precip: 0,   source: "local" },
  { day: "12. Jan", temp: 16.8, precip: 1.2, source: "local" },
  { day: "13. Jan", temp: 17.1, precip: 0,   source: "local" },
  { day: "14. Jan", temp: 15.9, precip: 0,   source: "local" },
  { day: "15. Jan", temp: 16.2, precip: 0,   source: "local" },
  { day: "16. Jan", temp: 17.5, precip: 5.2, source: "local" },  // Regen!
  { day: "17. Jan", temp: 18.0, precip: 0,   source: "local" },
  { day: "18. Jan", temp: 18.2, precip: 2.5, source: "local" },  // Heute bis 18:00
  
  // VORHERSAGE (Zukunft):
  { day: "19. Jan", temp: 20.5, precip: 0,   source: "OpenMeteo" },  // Morgen
  { day: "20. Jan", temp: 22.1, precip: 0,   source: "OpenMeteo" },
  { day: "21. Jan", temp: 21.8, precip: 0,   source: "OpenMeteo" },
  { day: "22. Jan", temp: 20.2, precip: 3.0, source: "OpenMeteo" },  // Regen erwartet
  { day: "23. Jan", temp: 18.5, precip: 1.5, source: "OpenMeteo" },
  { day: "24. Jan", temp: 19.1, precip: 0,   source: "OpenMeteo" },
  { day: "25. Jan", temp: 20.8, precip: 0,   source: "OpenMeteo" }
]

// 3. Zimmerman Algorithmus analysiert diese 15 Tage:
// - 16. Jan: 5.2mm Regen (gemessen!) → Boden war nass
// - 18. Jan: 2.5mm Regen (gemessen!) → Boden ist jetzt nass
// - 22. Jan: 3.0mm Regen erwartet → Boden wird nass sein
// → Entscheidung: Bewässerung auf 40% reduzieren
```

---

## 🎯 Warum das genial ist

### ✅ Vorteile des Hybrid-Ansatzes:

**1. Präzise Vergangenheit**
- Du weißt GENAU wie viel es geregnet hat
- Du weißt GENAU wie warm es war
- Keine Schätzungen, keine Fehler

**2. Zuverlässige Zukunft**
- Professionelle Wettermodelle
- Mehrere Datenquellen kombiniert
- Besser als "einfach den Trend fortsetzen"

**3. Optimale Entscheidungen**
```
Schlechter Ansatz (nur Forecast):
"Es hat am 16. Jan 4mm geregnet (Forecast sagte 5mm)"
→ Ungenau! Vielleicht waren es 8mm oder 0mm

Schlechter Ansatz (nur Local):
"Es wird morgen wahrscheinlich... äh... wie heute?"
→ Ungenau! Wetter ändert sich

Hybrid Ansatz:
"Es hat am 16. Jan EXAKT 5.2mm geregnet (gemessen!)"
"Es wird am 22. Jan ca. 3mm regnen (Forecast)"
→ Beste verfügbare Daten für optimale Bewässerung!
```

---

## 🔍 Verwirrende Begriffe geklärt

| Begriff | Was manche denken | Was es WIRKLICH bedeutet |
|---------|-------------------|---------------------------|
| **"Local"** | Nur Vergangenheit | Vergangenheit + AKTUELL + Heute |
| **"Historical"** | Nur alte Daten | Vergangenheit + Heute bis jetzt |
| **"Current"** | Nur 1 Datenpunkt | Durchschnitt letzte 24h |
| **"Forecast"** | Alles nach jetzt | NUR ab morgen (heute = local!) |

---

## 📋 Cheat Sheet für Entwickler

```typescript
// ❓ Wann wird was aufgerufen?

// Mobile App zeigt aktuelles Wetter:
→ getWeatherDataInternal()
  → LocalProvider.getWeatherDataInternal()
  → Gibt 1 WeatherData Objekt zurück (JETZT)

// OpenSprinkler prüft ob Rain Delay:
→ getWeatherDataInternal()
  → prüft: data.raining === true?
  → Quelle: Letzte 24h von lokaler Station

// Zimmerman berechnet Watering Scale:
→ getWateringDataWithForecastProvider("OpenMeteo")
  → LocalProvider.getWateringDataInternal()
    → Gibt Array von 8 WateringData zurück (7 Tage + heute)
  → OpenMeteoProvider.getWateringDataInternal()
    → Gibt Array von 7 WateringData zurück (morgen bis +7)
  → Kombiniert zu 15 WateringData
  → Zimmerman analysiert alle 15 Tage
```

---

## 🐛 Häufige Missverständnisse

### ❌ FALSCH:
> "Hybrid nutzt Local nur für Vergangenheit, Forecast für heute"

### ✅ RICHTIG:
> "Hybrid nutzt Local für Vergangenheit UND heute, Forecast nur ab morgen"

---

### ❌ FALSCH:
> "Current Weather kommt vom Forecast Provider"

### ✅ RICHTIG:
> "Current Weather kommt immer von lokaler Station (außer Fallback)"

---

### ❌ FALSCH:
> "Historical Data endet gestern um Mitternacht"

### ✅ RICHTIG:
> "Historical Data beinhaltet auch heute von 00:00 bis jetzt"

---

## 💡 Für Pull Request / Dokumentation

Wenn du die Kommentare im Code änderst, stelle sicher dass du:

1. ✅ **Drei Datentypen klar trennst:** Current, Historical, Forecast
2. ✅ **Zeiträume genau definierst:** "JETZT", "letzte 7 Tage + heute", "morgen bis +7"
3. ✅ **Quellen angibst:** "Lokale Station", "Forecast Provider"
4. ✅ **Use Cases erklärst:** "Rain Delay", "Zimmerman", "App Display"
5. ✅ **Beispiele gibst:** Mit echten Timestamps und Werten

**Vermeide vage Begriffe wie:**
- ❌ "Historical" (ohne zu sagen dass heute dabei ist)
- ❌ "Past" (ohne Zeitraum)
- ❌ "Local data" (ohne zu sagen current + historical)

**Nutze präzise Begriffe:**
- ✅ "Past 7 days + today (00:00 to now)"
- ✅ "Current conditions (last 24 hours)"
- ✅ "Tomorrow through +7 days"

---

## 🎉 Zusammenfassung

**Hybrid Weather Provider = Drei Datenquellen optimal kombiniert:**

1. **Jetzt (Aktuell):** Deine Station misst LIVE → Rain Delay funktioniert
2. **Gestern + Heute:** Deine Station hat GEMESSEN → Präzise Historie
3. **Morgen + Zukunft:** Profis haben VORHERGESAGT → Gute Planung

= **Beste Bewässerungsentscheidungen!** 💧🌱
