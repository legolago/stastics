#!/bin/bash
set -e

# データベース接続情報
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-analysis}
DB_USER=${DB_USER:-user}
DB_PASSWORD=${DB_PASSWORD:-password}

# PostgreSQLに接続してマイグレーションを実行
export PGPASSWORD=$DB_PASSWORD

echo "Applying migration 002_add_analysis_type.sql..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f migrations/002_add_analysis_type.sql

echo "Migration completed successfully!"
