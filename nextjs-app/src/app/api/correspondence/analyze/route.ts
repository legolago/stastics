import { NextRequest, NextResponse } from 'next/server';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://python-api:8000';

export async function POST(request: NextRequest) {
  try {
    // URLパラメータを取得
    const { searchParams } = new URL(request.url);
    
    // FormDataを取得
    const formData = await request.formData();
    
    // Python APIのURLを構築（クエリパラメータを含む）
    const pythonUrl = new URL('/api/correspondence/analyze', PYTHON_API_URL);
    
    // すべてのクエリパラメータをPython APIに転送
    searchParams.forEach((value, key) => {
      pythonUrl.searchParams.append(key, value);
    });
    
    // Python APIに転送
    const response = await fetch(pythonUrl.toString(), {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Python API Error:', errorText);
      return NextResponse.json(
        { error: '分析中にエラーが発生しました', details: errorText },
        { status: response.status }
      );
    }

    const analysisResult = await response.json();
    return NextResponse.json(analysisResult);

  } catch (error) {
    // TypeScriptエラーを修正
    const errorMessage = error instanceof Error ? error.message : 'サーバーエラーが発生しました';
    const errorDetails = error instanceof Error ? error.message : String(error);
    
    console.error('Analysis API Error:', error);
    return NextResponse.json(
      { error: errorMessage, details: errorDetails },
      { status: 500 }
    );
  }
}