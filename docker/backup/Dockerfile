# Backup container: postgres client plus a cron that runs pg_dump nightly.
FROM postgres:16-alpine
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh
# Write the crontab at start so the runtime DATABASE_URL is captured, then run
# crond in the foreground. Runs at 02:30 daily.
CMD ["sh", "-c", "printf '30 2 * * * DATABASE_URL=\"%s\" /usr/local/bin/backup.sh >> /backups/backup.log 2>&1\\n' \"$DATABASE_URL\" > /etc/crontabs/root && crond -f -l 8"]
