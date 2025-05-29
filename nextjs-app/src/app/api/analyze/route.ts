import { NextRequest, NextResponse } from 'next/server';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://python-api:8000';

export async function POST(request: NextRequest) {
  try {
    // URLパラメータを取得
    const { searchParams } = new URL(request.url);
    
    // フォームデータを取得
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    // Query parametersから値を取得
    const sessionName = searchParams.get('session_name');
    const description = searchParams.get('description');
    const tags = searchParams.get('tags');
    const userId = searchParams.get('user_id') || 'default';
    const nComponents = searchParams.get('n_components') || '2';

    console.log('Received parameters:', { sessionName, description, tags, userId, nComponents }); // デバッグログ

    if (!file) {
      return NextResponse.json(
        { error: 'ファイルが選択されていません' },
        { status: 400 }
      );
    }

    if (!sessionName) {
      return NextResponse.json(
        { error: 'セッション名が入力されていません' },
        { status: 400 }
      );
    }

    // ファイルタイプをチェック
    if (!file.name.endsWith('.csv')) {
      return NextResponse.json(
        { error: 'CSVファイルのみ対応しています' },
        { status: 400 }
      );
    }

    // Python APIに転送するためのURLパラメータを構築
    const params = new URLSearchParams({
      session_name: sessionName,
      user_id: userId,
      n_components: nComponents,
    });
    
    if (description) params.append('description', description);
    if (tags) params.append('tags', tags);

    // Python APIに転送するためのFormDataを作成
    const pythonFormData = new FormData();
    pythonFormData.append('file', file);

    const pythonUrl = `${PYTHON_API_URL}/api/correspondence/analyze?${params.toString()}`;
    console.log('Calling Python API:', pythonUrl); // デバッグログ

    // Python APIを呼び出し
    const response = await fetch(pythonUrl, {
      method: 'POST',
      body: pythonFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Python API Error:', errorText);
      return NextResponse.json(
        { error: '分析中にエラーが発生しました', details: errorText },
        { status: response.status }
      );
    }

    // Python APIからの結果を取得
    const analysisResult = await response.json();

    // クライアントに結果を返却
    return NextResponse.json(analysisResult);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'サーバーエラーが発生しました';
    console.error('API Error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'コレスポンデンス分析API - POST /api/analyze でCSVファイルをアップロードしてください',
    version: '1.0.0'
  });
}