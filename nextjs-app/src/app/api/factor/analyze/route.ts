// app/api/factor/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://python-api:8000';

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 因子分析API呼び出し開始');
    
    const url = new URL(request.url);
    const searchParams = url.searchParams;

    // リクエストパラメータのログ出力
    const requestParams = {
      session_name: searchParams.get('session_name'),
      description: searchParams.get('description'),
      tags: searchParams.get('tags'),
      user_id: searchParams.get('user_id'),
      n_factors: searchParams.get('n_factors'),
      rotation: searchParams.get('rotation'),
      standardize: searchParams.get('standardize')
    };
    console.log('📝 リクエストパラメータ:', requestParams);

    // フォームデータの取得
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      console.error('❌ ファイルが提供されていません');
      return NextResponse.json(
        { error: 'ファイルが提供されていません' },
        { status: 400 }
      );
    }

    // ファイル情報のログ出力
    const fileInfo = {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: (file as any).lastModified ? new Date((file as any).lastModified).toISOString() : 'unknown'
    };
    console.log('📁 ファイル情報:', fileInfo);

    // Python APIエンドポイントの構築
    const pythonUrl = new URL('/api/factor/analyze', PYTHON_API_URL);
    searchParams.forEach((value, key) => {
      pythonUrl.searchParams.append(key, value);
    });

    console.log('🌐 Python API URL:', pythonUrl.toString());

    // Python APIに転送するためのFormDataを作成
    const pythonFormData = new FormData();
    pythonFormData.append('file', file);

    // Python APIを呼び出し
    console.log('📤 Python APIにリクエスト送信中...');
    const pythonResponse = await fetch(pythonUrl.toString(), {
      method: 'POST',
      body: pythonFormData,
      // タイムアウト設定
      signal: AbortSignal.timeout(60000), // 60秒
    });

    console.log('📥 Python APIレスポンス受信:', {
      status: pythonResponse.status,
      statusText: pythonResponse.statusText,
      ok: pythonResponse.ok,
      contentType: pythonResponse.headers.get('content-type')
    });

    // レスポンステキストを取得
    const responseText = await pythonResponse.text();
    console.log('📄 Python API生レスポンス:', {
      length: responseText.length,
      startsWith: responseText.substring(0, 100),
      isEmpty: responseText.trim() === ''
    });

    if (!pythonResponse.ok) {
      console.error('❌ Python API Error:', {
        status: pythonResponse.status,
        statusText: pythonResponse.statusText,
        responseText: responseText.substring(0, 500)
      });
      
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ エラーレスポンスのJSONパース失敗:', parseError);
        errorData = { 
          detail: `HTTP ${pythonResponse.status}: ${pythonResponse.statusText}`,
          raw_response: responseText.substring(0, 200)
        };
      }
      
      return NextResponse.json(
        { 
          error: 'Python APIでエラーが発生しました', 
          details: errorData,
          status: pythonResponse.status 
        },
        { status: pythonResponse.status }
      );
    }

    // 成功レスポンスのパース
    if (!responseText || responseText.trim() === '') {
      console.error('❌ 空のレスポンスを受信');
      return NextResponse.json(
        { error: 'Python APIから空のレスポンスが返されました' },
        { status: 500 }
      );
    }

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ レスポンスJSONパースエラー:', parseError);
      console.error('❌ 問題のあるレスポンス:', responseText);
      return NextResponse.json(
        { 
          error: 'Python APIからの応答を解析できませんでした',
          raw_response: responseText.substring(0, 200)
        },
        { status: 500 }
      );
    }
    
    console.log('✅ 因子分析完了:', {
      success: responseData.success,
      session_id: responseData.session_id,
      has_data: !!responseData.data,
      has_plot: !!responseData.plot_base64,
      error: responseData.error
    });

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('❌ 因子分析API Error:', error);
    
    // タイムアウトエラーの特別処理
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'リクエストがタイムアウトしました。Python APIが応答していません。' },
        { status: 504 }
      );
    }
    
    return NextResponse.json(
      { 
        error: '因子分析処理中にエラーが発生しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GETメソッドも追加（オプション）
export async function GET(request: NextRequest) {
  return NextResponse.json(
    { 
      message: '因子分析実行にはPOSTメソッドを使用してください',
      endpoint: '/api/factor/analyze',
      method: 'POST'
    },
    { status: 405 }
  );
}