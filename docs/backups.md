# Database backups

The tracker database (`prisma/dev.db`) is the only copy of captured history. Past observations cannot be captured again, so the app backs the database up automatically and never deletes a backup on its own.

## Where backups live

By default, backups go to `ff-tools-backups` in your home folder (`%USERPROFILE%\ff-tools-backups` on Windows). That folder is outside the repository, so deleting, cleaning, or re-cloning the checkout cannot take the backups with it. For a copy that also survives losing the computer, set `TRACKER_BACKUP_DIR` to a cloud-synced folder, such as one inside OneDrive.

Backups are never committed to Git. The repository is public and the database holds league and roster data. Git also keeps every committed file in history permanently, so a committed database could never be fully removed.

## When a backup is taken

A backup is saved only when the database has changed since the newest backup:

- when the app starts, then hourly while it runs
- on each capture worker check, which runs every minute
- before every capture
- before player seeding (`npm run players:seed`)
- before migrations: `npm run db:deploy` refuses to migrate if the backup fails

`npm run db:backup` always saves a fresh backup and reports how many exist.

Each backup is a consistent SQLite copy made with `VACUUM INTO`, which is safe while the app is running. It passes `PRAGMA integrity_check` before it is compressed and saved as `tracker-<UTC time>-<reason>.db.gz`. A few hundred kilobytes per backup is typical. Nothing is pruned automatically; if the folder ever grows large, archive old files by hand.

Tests never create backups: test mode has no backup folder.

## Restoring

1. Stop the app and the capture worker.
2. Run `npm run db:restore` to list backups, newest first.
3. Run `npm run db:restore -- <file name>`.

The chosen backup is decompressed and integrity-checked before anything changes. The current database is backed up first, as a `pre-restore` backup, so a restore can itself be undone. Restore refuses to run while the database is in use or has an unfinished transaction file.
