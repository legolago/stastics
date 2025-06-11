// 📁 utils/rfm-api.ts (API呼び出し用ユーティリティ)
import { RFMAnalysisRequest, RFMAnalysisResponse, RFMSessionDetail, RFMValidationResult } from '@/types/rfm';

const API_BASE_URL = '/api/rfm';

export class RFMApiClient {
  
  static async analyzeRFM(request: RFMAnalysisRequest): Promise<RFMAnalysisResponse> {
    const formData = new FormData();
    formData.append('file', request.file);
    
    const params = new URLSearchParams({
      session_name: request.session_name,
      customer_id_col: request.customer_id_col,
      date_col: request.date_col,
      amount_col: request.amount_col,
      rfm_divisions: request.rfm_divisions.toString(),
      ...(request.description && { description: request.description }),
      ...(request.tags && { tags: request.tags }),
      ...(request.user_id && { user_id: request.user_id }),
      ...(request.analysis_date && { analysis_date: request.analysis_date }),
      ...(request.use_monetary_4_divisions && { use_monetary_4_divisions: 'true' }),
    });

    const response = await fetch(`${API_BASE_URL}/analyze?${params}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'RFM分析に失敗しました');
    }

    return response.json();
  }

  static async getSessionDetail(sessionId: number): Promise<RFMSessionDetail> {
    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'セッション詳細の取得に失敗しました');
    }

    return response.json();
  }

  static async validateParameters(params: {
    customer_id_col: string;
    date_col: string;
    amount_col: string;
    analysis_date?: string;
    rfm_divisions: number;
  }): Promise<RFMValidationResult> {
    const searchParams = new URLSearchParams(
      Object.entries(params).reduce((acc, [key, value]) => {
        if (value !== undefined) {
          acc[key] = value.toString();
        }
        return acc;
      }, {} as Record<string, string>)
    );

    const response = await fetch(`${API_BASE_URL}/parameters/validate?${searchParams}`);
    
    if (!response.ok) {
      throw new Error('パラメータ検証に失敗しました');
    }

    return response.json();
  }

  static async downloadCustomersCSV(sessionId: number): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/download/${sessionId}/customers`);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'CSVダウンロードに失敗しました');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `rfm_customers_${sessionId}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  static async downloadDetailsCSV(sessionId: number): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/download/${sessionId}/details`);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || '詳細CSVダウンロードに失敗しました');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `rfm_details_${sessionId}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  static async downloadSegmentsCSV(sessionId: number): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/download/${sessionId}/segments`);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'セグメントCSVダウンロードに失敗しました');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `rfm_segments_${sessionId}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  static async getMethods() {
    const response = await fetch(`${API_BASE_URL}/methods`);
    
    if (!response.ok) {
      throw new Error('RFMメソッド一覧の取得に失敗しました');
    }

    return response.json();
  }

  static async getInterpretation() {
    const response = await fetch(`${API_BASE_URL}/interpretation`);
    
    if (!response.ok) {
      throw new Error('RFM解釈ガイドの取得に失敗しました');
    }

    return response.json();
  }

  static async healthCheck() {
    const response = await fetch(`${API_BASE_URL}/health`);
    
    if (!response.ok) {
      throw new Error('ヘルスチェックに失敗しました');
    }

    return response.json();
  }
}