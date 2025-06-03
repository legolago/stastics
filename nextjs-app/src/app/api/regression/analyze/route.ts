//src/app/api/regression/analyze/route.ts

import { NextRequest, NextResponse } from 'next/server';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://python-api:8000';
const API_TIMEOUT = 30000; // 30秒

// 型定義
interface ErrorResponse {
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

interface SuccessResponse {
  success: true;
  session_id: number;
  analysis_type: string;
  metadata: {
    session_name: string;
    filename: string;
    rows: number;
    columns: number;
    n_samples: number;
    n_features: number;
    test_size: number;
    include_intercept: boolean;
    [key: string]: any;
  };
  data: {
    regression_type: string;
    target_column: string;
    feature_names: string[];
    coefficients: number[];
    intercept: number;
    best_feature?: string;
    polynomial_degree?: number;
    train_r2: number;
    test_r2: number;
    train_rmse: number;
    test_rmse: number;
    train_mae: number;
    test_mae: number;
    plot_image: string;
    coordinates: Array<{
      name: string;
      dimension_1: number;
      dimension_2: number;
      type: string;
    }>;
    total_inertia: number;
    eigenvalues: number[];
    explained_inertia: number[];
    cumulative_inertia: number[];
    [key: string]: any;
  };
}

const ERROR_MESSAGES = {
  DATA_FORMAT: '回帰分析用のデータ形式が正しくありません。以下を確認してください：\n' +
    '・1行目にヘッダー（列名）があること\n' +
    '・1列目に行ラベルがあること\n' +
    '・数値データが2行2列以上あること\n' +
    '・目的変数が含まれていること',
  TARGET_VARIABLE: '指定された目的変数が見つかりません。利用可能なカラム名を確認してください。',
  INSUFFICIENT_DATA: '回帰分析に十分なデータがありません。最低10行以上のデータが推奨されます。',
  PARSE_ERROR: 'CSVファイルの解析に失敗しました。文字コードがUTF-8であることを確認してください。',
  FILE_ERROR: 'ファイルの処理中にエラーが発生しました。',
  NETWORK_ERROR: 'ネットワークエラーが発生しました。',
  TIMEOUT_ERROR: '処理がタイムアウトしました。',
  PARAMETER_ERROR: 'パラメータが不正です。'
};

// リクエストパラメータのバリデーション
function validateRequestParams(params: URLSearchParams): void {
  const requiredParams = ['session_name', 'user_id', 'target_column'];
  for (const param of requiredParams) {
    if (!params.has(param)) {
      throw new Error(`必須パラメータ '${param}' が不足しています`);
    }
  }

  const targetColumn = params.get('target_column');
  if (!targetColumn || targetColumn.trim() === '') {
    throw new Error('target_column は空にできません');
  }

  const regressionType = params.get('regression_type') || 'linear';
  if (!['linear', 'multiple', 'polynomial'].includes(regressionType)) {
    throw new Error('regression_type は linear, multiple, polynomial のいずれかである必要があります');
  }

  if (regressionType === 'polynomial') {
    const polynomialDegree = parseInt(params.get('polynomial_degree') || '2');
    if (isNaN(polynomialDegree) || polynomialDegree < 2 || polynomialDegree > 5) {
      throw new Error('polynomial_degree は2以上5以下の整数である必要があります');
    }
  }

  const testSize = parseFloat(params.get('test_size') || '0.3');
  if (isNaN(testSize) || testSize < 0.1 || testSize > 0.9) {
    throw new Error('test_size は0.1以上0.9以下の数値である必要があります');
  }
}

// ファイルのバリデーション（サーバーサイド対応）
function validateFormDataFile(file: File | Blob, fileName?: string): void {
  if (file.size === 0) {
    throw new Error('ファイルが空です');
  }

  // ファイル名のチェック（FormDataから取得した場合）
  const name = fileName || (file as any).name || '';
  if (name && !name.toLowerCase().endsWith('.csv')) {
    throw new Error('CSVファイルのみがサポートされています');
  }

  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    throw new Error('ファイルサイズが制限を超えています（上限: 10MB）');
  }
}

// CSVファイルの内容を検証（Blob対応）
async function validateCsvContent(file: Blob): Promise<void> {
  const content = await file.text();
  const lines = content.split('\n').map(line => line.trim()).filter(Boolean);

  if (lines.length < 3) {
    throw new Error('データが不足しています（ヘッダーと2行以上のデータが必要です）');
  }

  const headers = lines[0].split(',').map(h => h.trim());
  if (headers.length < 3) {
    throw new Error('列が不足しています（ラベル列と2列以上のデータが必要です）');
  }

  // 回帰分析では最低10行程度のデータが推奨
  if (lines.length < 11) { // ヘッダー1行 + データ10行
    console.warn('Warning: データ行数が少ないです。回帰分析には最低10行以上のデータが推奨されます。');
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    // リクエストパラメータの取得とバリデーション
    const { searchParams } = new URL(request.url);
    validateRequestParams(searchParams);
    console.log('Received regression analysis request parameters:', Object.fromEntries(searchParams));

    // FormDataの取得と検証
    const formData = await request.formData();
    const file = formData.get('file');
    
    if (!file || !(file instanceof Blob)) {
      throw new Error('ファイルが添付されていないか、不正な形式です');
    }

    // ファイル名を安全に取得
    const fileName = (file as any).name || 'unknown.csv';
    
    validateFormDataFile(file, fileName);
    await validateCsvContent(file);

    console.log('Regression analysis file info:', {
      name: fileName,
      size: file.size,
      type: file.type,
      targetColumn: searchParams.get('target_column'),
      regressionType: searchParams.get('regression_type') || 'linear',
      // lastModifiedはBlobには存在しない可能性があるため条件付きで取得
      lastModified: (file as any).lastModified ? new Date((file as any).lastModified).toISOString() : 'unknown'
    });

    // Python APIエンドポイントの構築
    const pythonUrl = new URL('/api/regression/analyze', PYTHON_API_URL);
    searchParams.forEach((value, key) => {
      pythonUrl.searchParams.append(key, value);
    });

    console.log('Calling Python Regression API:', pythonUrl.toString());

    try {
      const response = await fetch(pythonUrl.toString(), {
        method: 'POST',
        body: formData,
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      });

      const responseText = await response.text();
      let responseData: any;

      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        console.error('Failed to parse regression response:', responseText);
        throw new Error(ERROR_MESSAGES.PARSE_ERROR);
      }

      if (!response.ok) {
        console.error('Python Regression API Error:', {
          status: response.status,
          statusText: response.statusText,
          data: responseData,
          rawResponse: responseText
        });

        // エラーメッセージのカスタマイズ
        let errorMessage = '回帰分析中にエラーが発生しました';
        let errorDetail = responseData.detail;
        let hints = [
          'CSVファイルの内容を確認してください',
          '目的変数名が正しいか確認してください',
          '数値データが含まれているか確認してください'
        ];

        // 特定のエラーパターンに対する詳細な対応
        if (responseData?.detail?.includes('target_column') || responseData?.detail?.includes('目的変数')) {
          errorMessage = ERROR_MESSAGES.TARGET_VARIABLE;
          errorDetail = '指定された目的変数がデータに存在しません';
          hints = [
            'CSVファイルのヘッダー（1行目）に目的変数名が含まれていることを確認してください',
            '目的変数名にタイプミスがないか確認してください',
            'カラム名に余分なスペースや特殊文字が含まれていないか確認してください'
          ];
        } else if (responseData?.detail?.includes('insufficient') || responseData?.detail?.includes('不足')) {
          errorMessage = ERROR_MESSAGES.INSUFFICIENT_DATA;
          hints = [
            '最低10行以上のデータを用意してください',
            'データに欠損値が多すぎないか確認してください',
            '目的変数と説明変数の両方に十分なデータがあることを確認してください'
          ];
        } else if (responseData?.detail?.includes('numeric') || responseData?.detail?.includes('数値')) {
          errorMessage = '数値データの処理エラーです';
          hints = [
            'すべての数値カラムが正しい形式であることを確認してください',
            '文字列や記号が数値カラムに混入していないか確認してください',
            '欠損値（空白セル）がないか確認してください'
          ];
        } else if (responseData?.detail?.includes('CSV')) {
          errorMessage = 'CSVファイルの読み込みエラーです';
          hints = [
            'ファイルの文字コードがUTF-8であることを確認してください',
            'CSVファイルの形式が正しいことを確認してください',
            'ファイルが破損していないことを確認してください'
          ];
        }

        // デバッグ情報の表示（ファイル内容の安全な取得）
        let fileContent = '';
        try {
          fileContent = await file.text();
        } catch (e) {
          console.warn('Could not read file content for debugging:', e);
          fileContent = 'ファイル内容を読み取れませんでした';
        }

        return NextResponse.json({
          success: false,
          error: errorMessage,
          detail: errorDetail,
          hints: hints,
          debug: {
            filePreview: fileContent.split('\n').slice(0, 5), // 最初の5行を表示
            requestInfo: {
              url: pythonUrl.toString(),
              params: Object.fromEntries(searchParams)
            },
            apiResponse: {
              status: response.status,
              statusText: response.statusText
            }
          }
        } as ErrorResponse, { status: response.status });
      }

      console.log('Regression analysis completed in', Date.now() - startTime, 'ms');
      
      return NextResponse.json({
        success: true,
        ...responseData
      } as SuccessResponse);

    } finally {
      clearTimeout(timeoutId);
    }

  } catch (error) {
    console.error('Regression Analysis API Error:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration: Date.now() - startTime
    });

    const errorResponse: ErrorResponse = {
      success: false,
      error: error instanceof Error ? error.message : '回帰分析中にエラーが発生しました',
      detail: error instanceof Error ? error.stack : String(error),
      hints: [
        'ファイルの形式が正しいことを確認してください',
        '目的変数名が正しいことを確認してください',
        'サーバーの接続状態を確認してください',
        'しばらく時間をおいて再度お試しください'
      ]
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}

// GETメソッド: 利用可能な手法一覧を取得
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const pythonUrl = new URL('/api/regression/methods', PYTHON_API_URL);
    
    const response = await fetch(pythonUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch regression methods');
    }

    const methodsData = await response.json();
    return NextResponse.json(methodsData);

  } catch (error) {
    console.error('Regression methods API Error:', error);
    return NextResponse.json(
      { error: '回帰分析手法一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}