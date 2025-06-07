//src/app/apicorrespondence/analyze/route.ts - 修正版（エンドポイント統一のみ）

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
  metadata: {
    file_name: string;
    row_count: number;
    column_count: number;
    [key: string]: any;
  };
  data: {
    coordinates?: {
      rows?: Array<{
        dimension_1: number;
        dimension_2: number;
        name: string;
      }>;
      columns?: Array<{
        dimension_1: number;
        dimension_2: number;
        name: string;
      }>;
    };
    eigenvalues?: Array<{
      value: number;
      proportion: number;
      cumulative: number;
    }>;
    [key: string]: any;
  };
}

const ERROR_MESSAGES = {
  DATA_FORMAT: 'データの形式が正しくありません。以下を確認してください：\n' +
    '・1行目にヘッダー（列名）があること\n' +
    '・1列目に行ラベルがあること\n' +
    '・数値データが2行2列以上あること\n' +
    '・すべての数値が非負であること',
  ZERO_VALUES: '有効なデータが見つかりません。すべての行と列に少なくとも1つの非ゼロ値が必要です。',
  PARSE_ERROR: 'CSVファイルの解析に失敗しました。文字コードがUTF-8であることを確認してください。',
  FILE_ERROR: 'ファイルの処理中にエラーが発生しました。',
  NETWORK_ERROR: 'ネットワークエラーが発生しました。',
  TIMEOUT_ERROR: '処理がタイムアウトしました。'
};

// リクエストパラメータのバリデーション
function validateRequestParams(params: URLSearchParams): void {
  const requiredParams = ['session_name', 'user_id', 'n_components'];
  for (const param of requiredParams) {
    if (!params.has(param)) {
      throw new Error(`必須パラメータ '${param}' が不足しています`);
    }
  }

  const n_components = parseInt(params.get('n_components') || '');
  if (isNaN(n_components) || n_components < 2) {
    throw new Error('n_components は2以上の整数である必要があります');
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
}

export async function POST(request: NextRequest): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    // リクエストパラメータの取得とバリデーション
    const { searchParams } = new URL(request.url);
    validateRequestParams(searchParams);
    console.log('Received request parameters:', Object.fromEntries(searchParams));

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

    console.log('File info:', {
      name: fileName,
      size: file.size,
      type: file.type,
      // lastModifiedはBlobには存在しない可能性があるため条件付きで取得
      lastModified: (file as any).lastModified ? new Date((file as any).lastModified).toISOString() : 'unknown'
    });

    // 🔧 修正箇所: エンドポイントを統一パスに変更
    const pythonUrl = new URL('/api/correspondence/analyze', PYTHON_API_URL);
    searchParams.forEach((value, key) => {
      pythonUrl.searchParams.append(key, value);
    });

    console.log('Calling Python API:', pythonUrl.toString());

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
        console.error('Failed to parse response:', responseText);
        throw new Error(ERROR_MESSAGES.PARSE_ERROR);
      }

      if (!response.ok) {
        console.error('Python API Error:', {
          status: response.status,
          statusText: response.statusText,
          data: responseData,
          rawResponse: responseText
        });

        // エラーメッセージのカスタマイズ
        let errorMessage = 'データの分析中にエラーが発生しました';
        let errorDetail = responseData.detail;
        let hints = [
          'CSVファイルの内容を確認してください',
          'データの形式が正しいか確認してください',
          '数値データが含まれているか確認してください'
        ];

        // 特定のエラーパターンに対する詳細な対応
        if (responseData?.detail?.includes('(0, 0)')) {
          errorMessage = ERROR_MESSAGES.DATA_FORMAT;
          errorDetail = ERROR_MESSAGES.ZERO_VALUES;
          hints = [
            'CSVファイルの1行目にヘッダーが含まれていることを確認してください',
            '1列目に行ラベルが含まれていることを確認してください',
            'データ部分（2行目以降、2列目以降）に数値データがあることを確認してください',
            'すべての数値が非負であることを確認してください',
            '各行・各列に少なくとも1つの非ゼロ値があることを確認してください'
          ];
        } else if (responseData?.detail?.includes('empty')) {
          errorMessage = 'データファイルが空または無効です';
          hints = [
            'ファイルにデータが含まれていることを確認してください',
            'CSVファイルの形式が正しいことを確認してください'
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

      console.log('Analysis completed in', Date.now() - startTime, 'ms');
      
      return NextResponse.json({
        success: true,
        ...responseData
      } as SuccessResponse);

    } finally {
      clearTimeout(timeoutId);
    }

  } catch (error) {
    console.error('Analysis API Error:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration: Date.now() - startTime
    });

    const errorResponse: ErrorResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'データの分析中にエラーが発生しました',
      detail: error instanceof Error ? error.stack : String(error),
      hints: [
        'ファイルの形式が正しいことを確認してください',
        'サーバーの接続状態を確認してください',
        'しばらく時間をおいて再度お試しください'
      ]
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}