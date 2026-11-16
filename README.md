# Zombie-Perkolation

Interaktive Site-Perkolations-Simulationen im Browser (Vite + TypeScript, ohne Framework).

- **Ausbruch** – Menschen werden mit einstellbarer Dichte zufällig verteilt; ein Zombie infiziert
  Welle für Welle seine Nachbarn. Unterhalb der kritischen Dichte (Quadratgitter: ≈ 59,27 %) bleibt
  der Ausbruch lokal, darüber durchquert er die Karte.
- **Cluster** – alle zusammenhängenden Cluster eingefärbt, der durchspannende hervorgehoben.
- **Experiment** – Monte-Carlo-Schwellenkurve (Newman-Ziff) für mehrere Kartengrößen.

Wählbar sind 4er-, 6er- (Dreiecksgitter) und 8er-Nachbarschaft sowie eine Biss-Wahrscheinlichkeit.

```sh
pnpm install
pnpm dev      # Entwicklungsserver
pnpm build    # Typprüfung + Produktions-Build nach dist/
```
