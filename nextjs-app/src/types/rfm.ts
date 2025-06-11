// 📁 types/rfm.ts (型定義ファイル)
export interface RFMAnalysisRequest {
  file: File;
  session_name: string;
  description?: string;
  tags?: string;
  user_id?: string;
  customer_id_col: string;
  date_col: string;
  amount_col: string;
  analysis_date?: string;
  rfm_divisions: number;
  use_monetary_4_divisions?: boolean;
}

export interface RFMAnalysisResponse {
  success: boolean;
  session_id?: number;
  session_name?: string;
  analysis_type?: string;
  total_customers?: number;
  analysis_date?: string;
  customer_data?: RFMCustomerData[];
  segment_counts?: Record<string, number>;
  error?: string;
  details?: any;
}

export interface RFMCustomerData {
  customer_id: string;
  recency: number;
  frequency: number;
  monetary: number;
  rfm_score: number;
  r_score: string;
  f_score: string;
  m_score: string;
  segment: string;
}

export interface RFMSessionDetail {
  success: boolean;
  data: {
    session: {
      id: number;
      session_name: string;
      analysis_type: string;
      original_filename: string;
      analysis_timestamp: string;
      row_count: number;
      column_count: number;
      description?: string;
      tags: string[];
    };
    analysis_data: {
      total_customers: number;
      analysis_date: string;
      customer_data: RFMCustomerData[];
      segment_counts: Record<string, number>;
      rfm_stats: {
        recency: { mean: number; std: number; min: number; max: number };
        frequency: { mean: number; std: number; min: number; max: number };
        monetary: { mean: number; std: number; min: number; max: number };
      };
      segment_stats: Record<string, any>;
    };
  };
  error?: string;
}

export interface RFMValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

export interface RFMMethodsResponse {
  success: boolean;
  data: {
    rfm_divisions: Array<{
      value: number;
      name: string;
      description: string;
    }>;
    segment_definitions: Record<string, string>;
    required_columns: Record<string, string>;
    guidelines: Record<string, any>;
  };
}

export interface RFMInterpretationResponse {
  success: boolean;
  data: {
    rfm_metrics: Record<string, {
      description: string;
      interpretation: string;
    }>;
    segments: Record<string, {
      characteristics: string;
      action: string;
    }>;
    score_interpretation: Record<string, string>;
  };
}