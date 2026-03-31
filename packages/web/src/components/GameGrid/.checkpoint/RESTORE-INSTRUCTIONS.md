# GameGrid Checkpoint

To restore the GameGrid files to their pre-refactor state:

```bash
cp packages/web/src/components/GameGrid/.checkpoint/GameGrid.tsx.bak packages/web/src/components/GameGrid/GameGrid.tsx
cp packages/web/src/components/GameGrid/.checkpoint/game-grid.css.bak packages/web/src/components/GameGrid/game-grid.css
```

These backups were created before the Premium Dark Mode UI refactor.
