// types/analysis.ts

// 基本的な分析セッション情報
export interface AnalysisSession {
  session_id: number;
  session_name: string;
  filename: string;
  description?: string;
  tags: string[];
  analysis_timestamp: string;
  analysis_type: string;
  total_inertia?: number;
  dimension_1_contribution?: number;
  dimension_2_contribution?: number;
  row_count: number;
  column_count: number;
}

// コレスポンデンス分析のパラメータ
export interface CorrespondenceParams {
  n_components: number;
}

// 座標データ
export interface CoordinatePoint {
  name: string;
  dimension_1: number;
  dimension_2: number;
}

export interface CoordinatesData {
  rows: CoordinatePoint[];
  columns: CoordinatePoint[];
}

// 固有値データ
export interface EigenvalueInfo {
  dimension: number;
  eigenvalue: number;
  explained_inertia: number;
  cumulative_inertia: number;
}

// 分析データ（Python APIからの詳細レスポンス）
export interface AnalysisData {
  total_inertia?: number;
  chi2?: number;
  degrees_of_freedom?: number;
  dimensions_count?: number;
  eigenvalues?: EigenvalueInfo[];
  coordinates?: CoordinatesData;
}

// 可視化データ
export interface VisualizationData {
  plot_image?: string;
  image_info?: {
    width?: number;
    height?: number;
    size_bytes?: number;
  };
}

// セッション情報（詳細）
export interface SessionInfo {
  session_id: number;
  session_name: string;
  filename: string;
  description?: string;
  tags: string[];
  analysis_timestamp: string;
  user_id?: string;
}

// メタデータ
export interface MetaData {
  row_count: number;
  column_count: number;
  file_size?: number;
}

// Python APIからのセッション詳細レスポンス
export interface PythonSessionDetailResponse {
  success: boolean;
  session_info: SessionInfo;
  analysis_data: AnalysisData;
  metadata: MetaData;
  visualization: VisualizationData;
}

// Next.js APIからのセッション詳細レスポンス
export interface SessionDetailResponse {
  success: boolean;
  data: PythonSessionDetailResponse;
}

// コレスポンデンス分析の結果データ
export interface CorrespondenceAnalysisData {
  total_inertia: number;
  chi2: number;
  degrees_of_freedom: number;
  n_components: number;
  eigenvalues: number[];
  explained_inertia: number[];
  cumulative_inertia: number[];
  plot_image: string;
  coordinates: CoordinatesData;
}

// コレスポンデンス分析のメタデータ
export interface AnalysisMetadata {
  session_name?: string;
  filename: string;
  rows: number;
  columns: number;
  row_names?: string[];
  column_names?: string[];
}

// セッション情報（簡略版）
export interface AnalysisSessionInfo {
  session_id: number;
  session_name: string;
  description?: string;
  tags: string[];
  analysis_timestamp: string;
  filename: string;
  analysis_type: string;
  row_count: number;
  column_count: number;
}

// コレスポンデンス分析の結果（統合型）
export interface CorrespondenceAnalysisResult {
  success: boolean;
  session_id: number;
  session_name?: string;
  analysis_type: string;
  plot_base64?: string;
  data: CorrespondenceAnalysisData;
  metadata: AnalysisMetadata;
  session_info?: AnalysisSessionInfo;
}

// 汎用的な分析結果型（後方互換性のため）
export interface AnalysisResult extends CorrespondenceAnalysisResult {}

// APIエラーレスポンス
export interface ApiErrorResponse {
  success: false;
  error: string;
  detail?: string;
  hints?: string[];
  debug?: {
    filePreview?: string[];
    requestInfo?: {
      url: string;
      params: Record<string, string>;
    };
  };
}

// APIレスポンスの基本型
export type ApiResponse<T> = T | ApiErrorResponse;

// セッション一覧のレスポンス
export interface SessionListResponse {
  success: boolean;
  data: AnalysisSession[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_next: boolean;
  };
}

// 分析実行のレスポンス
export interface AnalyzeResponse extends CorrespondenceAnalysisResult {}

// ファイルアップロードの設定
export interface FileUploadConfig {
  accept: string;
  maxSize?: number;
  disabled?: boolean;
}

// 分析設定
export interface AnalysisConfig {
  session_name: string;
  description?: string;
  tags?: string;
  user_id?: string;
  parameters: CorrespondenceParams;
}