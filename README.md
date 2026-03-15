# 🌌 Asteroid Blitz

Jeu multijoueur minimaliste : vaisseaux low-poly, astéroïdes, cristaux et sabotage.

## Lancer le jeu

```bash
cd asteroid-blitz
bun run server/index.js
```

Ouvre `client/index.html` dans **1 à 4 onglets** Chrome/Firefox.

## Contrôles

| Touche | Action |
|--------|--------|
| W / ↑ | Propulseur |
| A / ← | Rotation gauche |
| D / → | Rotation droite |
| Espace | Tirer |

## Mécaniques

- **Tirer sur un astéroïde** → le détruit → cristaux
- **Tirer sur un astéroïde résistant** → le **dévie** vers les ennemis (tagué à ton nom)
- Si l'astéroïde dévié touche un ennemi → **+50 cristaux bonus**
- Premier à **500 cristaux** gagne, ou dernier en vie, ou meilleur score après 3 min

## Scores

| Action | Cristaux |
|--------|----------|
| Détruire grand astéroïde | 50 |
| Détruire astéroïde moyen | 25 |
| Détruire petit astéroïde | 10 |
| Déflexion → hit ennemi | +50 bonus |
