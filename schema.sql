-- コレスポンデンス分析結果保存用テーブル

-- 1. 分析セッションのメタデータ
CREATE TABLE analysis_sessions (
    id SERIAL PRIMARY KEY,
    session_name VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_size INTEGER,
    upload_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    analysis_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT,
    tags TEXT[], -- 検索用タグ
    user_id VARCHAR(100), -- 将来的なマルチユーザー対応
    
    -- 分析結果の統計情報
    total_inertia DECIMAL(10, 8),
    chi2_value DECIMAL(15, 4),
    degrees_of_freedom INTEGER,
    row_count INTEGER,
    column_count INTEGER,
    
    -- 次元数と寄与率
    dimensions_count INTEGER DEFAULT 2,
    dimension_1_contribution DECIMAL(8, 6),
    dimension_2_contribution DECIMAL(8, 6),
    
    -- 分析設定
    analysis_parameters JSONB, -- 分析パラメータの保存
    
    -- インデックス用
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. 元データ（CSV）の保存
CREATE TABLE original_data (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES analysis_sessions(id) ON DELETE CASCADE,
    csv_data TEXT NOT NULL, -- CSVファイルの内容をテキストとして保存
    row_names TEXT[], -- 行名の配列
    column_names TEXT[], -- 列名の配列
    data_matrix JSONB -- データ行列をJSONBとして保存（検索可能）
);

-- 3. 分析結果の座標データ
CREATE TABLE coordinates_data (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES analysis_sessions(id) ON DELETE CASCADE,
    point_type VARCHAR(20) NOT NULL, -- 'row' or 'column'
    point_name VARCHAR(255) NOT NULL,
    dimension_1 DECIMAL(12, 8),
    dimension_2 DECIMAL(12, 8),
    contribution_dim1 DECIMAL(8, 6), -- この点の第1次元への寄与
    contribution_dim2 DECIMAL(8, 6), -- この点の第2次元への寄与
    quality_representation DECIMAL(8, 6), -- 表現の質
    
    -- 追加の次元（将来的な拡張用）
    dimension_3 DECIMAL(12, 8),
    dimension_4 DECIMAL(12, 8),
    
    UNIQUE(session_id, point_type, point_name)
);

-- 4. 可視化データ（PNG画像）
CREATE TABLE visualization_data (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES analysis_sessions(id) ON DELETE CASCADE,
    image_type VARCHAR(50) DEFAULT 'correspondence_plot', -- プロットの種類
    image_data BYTEA NOT NULL, -- PNG画像のバイナリデータ
    image_base64 TEXT, -- Base64エンコードされた画像データ
    image_size INTEGER, -- 画像サイズ（バイト）
    width INTEGER, -- 画像の幅
    height INTEGER, -- 画像の高さ
    dpi INTEGER DEFAULT 300,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. 固有値・寄与率データ
CREATE TABLE eigenvalue_data (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES analysis_sessions(id) ON DELETE CASCADE,
    dimension_number INTEGER NOT NULL,
    eigenvalue DECIMAL(12, 8),
    explained_inertia DECIMAL(8, 6), -- 説明される慣性の割合
    cumulative_inertia DECIMAL(8, 6), -- 累積寄与率
    
    UNIQUE(session_id, dimension_number)
);

-- インデックスの作成（検索性能向上）
CREATE INDEX idx_analysis_sessions_timestamp ON analysis_sessions(analysis_timestamp);
CREATE INDEX idx_analysis_sessions_filename ON analysis_sessions(original_filename);
CREATE INDEX idx_analysis_sessions_tags ON analysis_sessions USING GIN(tags);
CREATE INDEX idx_analysis_sessions_user ON analysis_sessions(user_id);
CREATE INDEX idx_coordinates_session_type ON coordinates_data(session_id, point_type);
CREATE INDEX idx_visualization_session ON visualization_data(session_id);

-- 検索用の全文検索インデックス
CREATE INDEX idx_analysis_sessions_search ON analysis_sessions USING GIN(
    to_tsvector('japanese', COALESCE(session_name, '') || ' ' || COALESCE(description, ''))
);

-- 更新時間の自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_analysis_sessions_updated_at 
    BEFORE UPDATE ON analysis_sessions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();