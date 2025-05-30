import { NextRequest, NextResponse } from 'next/server';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://python-api:8000';

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const searchParams = url.searchParams;

    // リクエストパラメータのログ出力
    console.log('Received Factor Analysis request parameters:', {
      session_name: searchParams.get('session_name'),
      description: searchParams.get('description'),
      tags: searchParams.get('tags'),
      user_id: searchParams.get('user_id'),
      n_factors: searchParams.get('n_factors'),
      rotation: searchParams.get('rotation'),
      standardize: searchParams.get('standardize')
    });

    // フォームデータの取得
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'ファイルが提供されていません' },
        { status: 400 }
      );
    }

    // ファイル情報のログ出力
    const fileName = file.name;
    console.log('Factor Analysis File info:', {
      name: fileName,
      size: file.size,
      type: file.type,
      lastModified: (file as any).lastModified ? new Date((file as any).lastModified).toISOString() : 'unknown'
    });

    // Python APIエンドポイントの構築
    const pythonUrl = new URL('/api/factor/analyze', PYTHON_API_URL);
    searchParams.forEach((value, key) => {
      pythonUrl.searchParams.append(key, value);
    });

    console.log('Calling Python Factor Analysis API:', pythonUrl.toString());

    // Python APIに転送するためのFormDataを作成
    const pythonFormData = new FormData();
    pythonFormData.append('file', file);

    // Python APIを呼び出し
    const pythonResponse = await fetch(pythonUrl.toString(), {
      method: 'POST',
      body: pythonFormData,
    });

    if (!pythonResponse.ok) {
      const errorData = await pythonResponse.json().catch(() => ({ detail: 'Unknown error' }));
      console.log('Python Factor Analysis API Error:', {
        status: pythonResponse.status,
        statusText: pythonResponse.statusText,
        data: errorData,
        rawResponse: await pythonResponse.text().catch(() => 'Unable to read response')
      });
      
      return NextResponse.json(
        { 
          error: 'Python APIでエラーが発生しました', 
          details: errorData,
          status: pythonResponse.status 
        },
        { status: pythonResponse.status }
      );
    }

    // Python APIからのレスポンスを取得
    const responseData = await pythonResponse.json();
    
    console.log('Factor Analysis completed successfully:', {
      session_id: responseData.session_id,
      session_name: responseData.session_name,
      has_plot: !!responseData.plot_base64,
      data_size: responseData.data ? Object.keys(responseData.data).length : 0
    });

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('Factor Analysis API Error:', error);
    return NextResponse.json(
      { 
        error: '因子分析処理中にエラーが発生しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}