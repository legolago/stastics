# データベースマイグレーション

## 概要
このディレクトリには、データベーススキーマの変更履歴が保存されています。

## ファイル命名規則
- `001_initial_schema.sql` - 初期スキーマ
- `002_add_analysis_type.sql` - 分析手法種類の追加
- `XXX_description.sql` - 連番_説明.sql

## 実行方法
```bash
# 開発環境（Docker）
./migrations/apply_migrations.sh

# 本番環境
PGPASSWORD=password psql -h hostname -U username -d dbname -f migrations/002_add_analysis_type.sql
```

## ロールバック
各マイグレーションファイルには対応するロールバック用SQLを含めることを推奨します。
