// 基本的な分析結果インターフェース
export interface BaseAnalysisResult {
  success: boolean;
  session_id: number;
  analysis_type: 'correspondence' | 'pca' | 'factor' | 'cluster';
  data: any;
  metadata: {
    session_name: string;
    filename: string;
    rows: number;
    columns: number;
    [key: string]: any;
  };
}

// コレスポンデンス分析結果
export interface CorrespondenceAnalysisResult extends BaseAnalysisResult {
  analysis_type: 'correspondence';
  data: {
    total_inertia: number;
    chi2: number;
    eigenvalues: number[];
    explained_inertia: number[];
    cumulative_inertia: number[];
    degrees_of_freedom: number;
    plot_image: string;
  };
  metadata: {
    session_name: string;
    filename: string;
    rows: number;
    columns: number;
    row_names: string[];
    column_names: string[];
  };
}

// 主成分分析結果
export interface PCAAnalysisResult extends BaseAnalysisResult {
  analysis_type: 'pca';
  data: {
    explained_variance_ratio: number[];
    cumulative_variance_ratio: number[];
    eigenvalues: number[];
    n_components: number;
    n_samples: number;
    n_features: number;
    standardized: boolean;
    plot_image: string;
  };
  metadata: {
    session_name: string;
    filename: string;
    rows: number;
    columns: number;
    original_features: string[];
    numeric_features: number;
  };
}

// 分析セッション情報
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

// 分析手法の設定
export interface AnalysisMethod {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  status: 'available' | 'development' | 'disabled';
  parameters?: {
    [key: string]: {
      type: 'integer' | 'boolean' | 'string' | 'float';
      default: any;
      min?: number;
      max?: number;
      description: string;
    };
  };
}

// ファイルアップロード用の設定
export interface UploadConfig {
  sessionName: string;
  description: string;
  tags: string;
}

// コレスポンデンス分析用のパラメータ
export interface CorrespondenceParams {
  n_components: number;
}

// 主成分分析用のパラメータ
export interface PCAParams {
  n_components: number;
  standardize: boolean;
}

// 因子分析用のパラメータ
export interface FactorParams {
  n_factors: number;
  rotation: string;
  method: string;
}

// クラスター分析用のパラメータ
export interface ClusterParams {
  n_clusters: number;
  method: 'kmeans' | 'hierarchical';
  linkage?: string;
}

// API レスポンス用の基本型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// セッション一覧のレスポンス
export interface SessionsResponse {
  success: boolean;
  data: AnalysisSession[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_next: boolean;
  };
}

// 利用可能な分析手法一覧
export interface MethodsResponse {
  methods: AnalysisMethod[];
}

// パラメータ検証結果
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

// ダウンロード用の型
export interface DownloadOptions {
  sessionId: number;
  type: 'csv' | 'image' | 'result';
}

// 共通コンポーネント用のプロパティ
export interface AnalysisLayoutProps {
  children: React.ReactNode;
  title: string;
  description: string;
  analysisType: string;
}

export interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  maxSize?: number;
  disabled?: boolean;
}

export interface SessionHistoryProps {
  sessions: AnalysisSession[];
  loading: boolean;
  onSessionSelect: (sessionId: number) => void;
  onSessionDelete: (sessionId: number) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  analysisType?: string;
}

export interface ResultDisplayProps {
  result: BaseAnalysisResult;
  onDownload: (options: DownloadOptions) => void;
}

export interface ParameterFormProps {
  analysisType: string;
  parameters: { [key: string]: any };
  onChange: (parameters: { [key: string]: any }) => void;
  onValidate?: (result: ValidationResult) => void;
}

// エラー処理用の型
export interface AnalysisError {
  code: string;
  message: string;
  details?: any;
}

// 統計情報表示用の型
export interface StatsSummary {
  [key: string]: {
    label: string;
    value: string | number;
    format?: 'number' | 'percentage' | 'decimal';
  };
}

// 既存のCorrespondenceAnalysisResultを拡張
export interface AnalysisResult extends CorrespondenceAnalysisResult {
  session_name: string;
  plot_base64: string;
  session_info: {
    session_id: number;
    session_name: string;
    description: string;
    tags: string[];
    analysis_timestamp: string;
    filename: string;
    analysis_type?: string;
    row_count?: number;
    column_count?: number;
  };
  data: {
    total_inertia: number;
    chi2: number;
    degrees_of_freedom: number;
    n_components: number;
    eigenvalues: number[];
    explained_inertia: number[];
    cumulative_inertia: number[];
    plot_image: string;
    coordinates: {
      rows: Array<{
        name: string;
        dimension_1: number;
        dimension_2: number;
      }>;
      columns: Array<{
        name: string;
        dimension_1: number;
        dimension_2: number;
      }>;
    };
  };
}

// 座標データ用の型
export interface CoordinatePoint {
  name: string;
  dimension_1: number;
  dimension_2: number;
}

export interface CoordinatesData {
  rows: CoordinatePoint[];
  columns: CoordinatePoint[];
}

// セッション詳細レスポンス用の型
export interface SessionDetailResponse extends ApiResponse {
  data: {
    session_id: number;
    session_name: string;
    filename: string;
    description: string;
    tags: string[];
    analysis_timestamp: string;
    analysis_type: string;
    total_inertia: number;
    dimension_1_contribution: number;
    dimension_2_contribution: number;
    row_count: number;
    column_count: number;
  };
}