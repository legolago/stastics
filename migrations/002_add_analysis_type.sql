-- マイグレーション: 分析手法の種類を追加
-- 作成日: 2024-XX-XX
-- 説明: 多変量解析手法の追加に伴うデータベース拡張

-- 1. analysis_sessionsテーブルに新しいカラムを追加
ALTER TABLE analysis_sessions 
ADD COLUMN analysis_type VARCHAR(50) DEFAULT 'correspondence';

-- 2. 既存のデータを更新
UPDATE analysis_sessions 
SET analysis_type = 'correspondence' 
WHERE analysis_type IS NULL;

-- 3. インデックスを追加
CREATE INDEX idx_analysis_sessions_type ON analysis_sessions(analysis_type);
CREATE INDEX idx_analysis_sessions_user_type ON analysis_sessions(user_id, analysis_type);

-- 4. constraints_dataテーブルの制約を追加
ALTER TABLE coordinates_data 
ADD CONSTRAINT chk_point_type 
CHECK (point_type IN ('row', 'column', 'observation', 'variable'));

-- 5. visualization_dataテーブルの制約を追加
ALTER TABLE visualization_data 
ADD CONSTRAINT chk_image_type 
CHECK (image_type IN ('correspondence_plot', 'pca_plot', 'factor_plot', 'cluster_plot'));

-- 6. パフォーマンス向上のための追加インデックス
CREATE INDEX idx_coordinates_data_session_type ON coordinates_data(session_id, point_type);
CREATE INDEX idx_visualization_data_session_type ON visualization_data(session_id, image_type);
CREATE INDEX idx_eigenvalue_data_session_dim ON eigenvalue_data(session_id, dimension_number);

-- 7. テーブルの統計情報を更新
ANALYZE analysis_sessions;
ANALYZE coordinates_data;
ANALYZE visualization_data;
ANALYZE eigenvalue_data;
