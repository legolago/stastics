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
  // PCA用のプロパティを追加
  chi2_value?: number; // コレスポンデンス分析ではカイ二乗値、PCAではKMO値として使用
  degrees_of_freedom?: number; // コレスポンデンス分析では自由度、PCAでは主成分数として使用
}

// コレスポンデンス分析のパラメータ
export interface CorrespondenceParams {
  n_components: number;
}

// PCA分析のパラメータ
export interface PCAParams {
  n_components: number;
  standardize: boolean;
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

// PCA用の座標データ
export interface PCACoordinatesData {
  scores: CoordinatePoint[]; // 主成分得点
  loadings: CoordinatePoint[]; // 主成分負荷量
}

// 固有値データ
export interface EigenvalueInfo {
  dimension: number;
  eigenvalue: number;
  explained_inertia: number;
  cumulative_inertia: number;
}

// 🔧 分析データの基底インターフェース
export interface BaseAnalysisData {
  n_components: number;
  eigenvalues: number[];
  plot_image: string;
}

// 分析データ（Python APIからの詳細レスポンス）
export interface AnalysisData {
  total_inertia?: number;
  chi2?: number;
  degrees_of_freedom?: number;
  dimensions_count?: number;
  eigenvalues?: EigenvalueInfo[];
  coordinates?: CoordinatesData;
  // PCA用のプロパティ
  n_components?: number;
  n_samples?: number;
  n_features?: number;
  standardized?: boolean;
  explained_variance_ratio?: number[];
  cumulative_variance_ratio?: number[];
  kmo?: number;
  determinant?: number;
  pca_coordinates?: PCACoordinatesData;
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

// 🔧 コレスポンデンス分析の結果データ（BaseAnalysisDataを継承）
export interface CorrespondenceAnalysisData extends BaseAnalysisData {
  total_inertia: number;
  chi2: number;
  degrees_of_freedom: number;
  explained_inertia: number[];
  cumulative_inertia: number[];
  coordinates: CoordinatesData;
}

// 🔧 PCA分析の結果データ（BaseAnalysisDataを継承）
export interface PCAAnalysisData extends BaseAnalysisData {
  n_samples: number;
  n_features: number;
  standardized: boolean;
  explained_variance_ratio: number[];
  cumulative_variance_ratio: number[];
  kmo: number;
  determinant: number;
  coordinates: PCACoordinatesData;
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

// PCA分析のメタデータ
export interface PCAMetadata {
  session_name: string;
  filename: string;
  rows: number;
  columns: number;
  sample_names: string[];
  feature_names: string[];
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

// 🔧 分析結果の基底インターフェース
export interface BaseAnalysisResult {
  success: boolean;
  session_id: number;
  session_name?: string;
  plot_base64?: string;
  session_info?: AnalysisSessionInfo;
}

// 🔧 コレスポンデンス分析の結果（型安全性向上）
export interface CorrespondenceAnalysisResult extends BaseAnalysisResult {
  analysis_type: 'correspondence';
  data: CorrespondenceAnalysisData;
  metadata: AnalysisMetadata;
}

// 🔧 PCA分析の結果（型安全性向上）
export interface PCAAnalysisResult extends BaseAnalysisResult {
  analysis_type: 'pca';
  data: PCAAnalysisData;
  metadata: PCAMetadata;
}

// 🔧 汎用的な分析結果型（ユニオン型に修正）
export type AnalysisResult = CorrespondenceAnalysisResult | PCAAnalysisResult;

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

// API 成功レスポンスの型定義
export interface ApiSuccessResponse {
  success: true;
  session_id: number;
  data: any;
  metadata: any;
  [key: string]: any;
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
  error?: string;
  debug?: {
    requested_analysis_type: string | null;
    total_found: number;
    returned_count: number;
    query_params: Record<string, any>;
  };
}

// Sessions API レスポンス型
export interface SessionsApiResponse {
  success: boolean;
  data: AnalysisSession[];
  error?: string;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_next: boolean;
  };
  debug?: {
    requested_analysis_type: string | null;
    total_found: number;
    returned_count: number;
    query_params: Record<string, any>;
  };
}

// 分析実行のレスポンス
export interface AnalyzeResponse extends CorrespondenceAnalysisResult {}

// PCA分析実行のレスポンス
export interface PCAAnalyzeResponse extends PCAAnalysisResult {}

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

// PCA分析設定
export interface PCAAnalysisConfig {
  session_name: string;
  description?: string;
  tags?: string;
  user_id?: string;
  parameters: PCAParams;
}

// 🔧 型ガード関数（修正版）
export function isPCASession(session: AnalysisSession): session is AnalysisSession & { analysis_type: 'pca' } {
  return session.analysis_type === 'pca';
}

export function isCorrespondenceSession(session: AnalysisSession): session is AnalysisSession & { analysis_type: 'correspondence' } {
  return session.analysis_type === 'correspondence';
}

export function isFactorSession(session: AnalysisSession): session is AnalysisSession & { analysis_type: 'factor' } {
  return session.analysis_type === 'factor';
}

// 🔧 分析結果の型ガード関数（修正版）
export function isPCAResult(result: AnalysisResult): result is PCAAnalysisResult {
  return result.analysis_type === 'pca';
}

export function isCorrespondenceResult(result: AnalysisResult): result is CorrespondenceAnalysisResult {
  return result.analysis_type === 'correspondence';
}

// 型安全なヘルパー型
export type AnalysisType = 'pca' | 'correspondence' | 'factor'| 'cluster';

export type TypeCounts = Record<string, number>;

// PCAセッション特化型
export interface PCASession extends AnalysisSession {
  analysis_type: 'pca';
  chi2_value?: number; // KMO値
  degrees_of_freedom?: number; // 主成分数
}

// Correspondenceセッション特化型
export interface CorrespondenceSession extends AnalysisSession {
  analysis_type: 'correspondence';
  chi2_value?: number; // カイ二乗値
  degrees_of_freedom?: number; // 自由度
}

// Factor分析セッション特化型
export interface FactorSession extends AnalysisSession {
  analysis_type: 'factor';
  chi2_value?: number; // 適合度統計量
  degrees_of_freedom?: number; // 因子数
}

// イベントハンドラー用の型
export type SessionClickHandler = (sessionId: number) => void;
export type SessionDeleteHandler = (sessionId: number) => Promise<void>;
export type FileSelectHandler = (file: File) => void;
export type UploadHandler = () => Promise<void>;

// フォーム関連の型
export interface AnalysisFormData {
  sessionName: string;
  description: string;
  tags: string;
  file: File | null;
}

export interface PCAFormData extends AnalysisFormData {
  parameters: PCAParams;
}

export interface CorrespondenceFormData extends AnalysisFormData {
  parameters: CorrespondenceParams;
}

// コンポーネントProps用の型
export interface AnalysisLayoutProps {
  title: string;
  description: string;
  analysisType: AnalysisType;
  children: React.ReactNode;
}

export interface FileUploadProps {
  onFileSelect: FileSelectHandler;
  accept: string;
  disabled?: boolean;
}

// 状態管理用の型
export interface AnalysisPageState {
  sessions: AnalysisSession[];
  sessionsLoading: boolean;
  result: AnalysisResult | null;
  error: string | null;
  loading: boolean;
  activeTab: 'upload' | 'history';
  searchQuery: string;
}

export interface PCAPageState {
  sessions: AnalysisSession[];
  sessionsLoading: boolean;
  result: PCAAnalysisResult | null;
  error: string | null;
  loading: boolean;
  activeTab: 'upload' | 'history';
  searchQuery: string;
  parameters: PCAParams;
}

export interface CorrespondencePageState {
  sessions: AnalysisSession[];
  sessionsLoading: boolean;
  result: CorrespondenceAnalysisResult | null;
  error: string | null;
  loading: boolean;
  activeTab: 'upload' | 'history';
  searchQuery: string;
  parameters: CorrespondenceParams;
}

// API呼び出し用の型
export interface FetchSessionsParams {
  userId?: string;
  limit?: number;
  offset?: number;
  analysis_type?: AnalysisType;
  search?: string;
  tags?: string;
}

export interface AnalysisRequestParams {
  session_name: string;
  description?: string;
  tags?: string;
  user_id?: string;
  n_components?: number;
  standardize?: boolean; // PCA用
}

// 🔧 型安全なダウンロード関数の型
export type DownloadHandler = (sessionId: number) => Promise<void>;
export type AnalysisResultDownloadHandler = (result: AnalysisResult) => Promise<void>;

// 🔧 分析特化型のダウンロードハンドラー
export type PCADownloadHandler = (result: PCAAnalysisResult) => Promise<void>;
export type CorrespondenceDownloadHandler = (result: CorrespondenceAnalysisResult) => Promise<void>;