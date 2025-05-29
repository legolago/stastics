import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // FastAPI バックエンドにリクエストを転送
    const formData = await request.formData();
    
    // FastAPI サーバーのURL（環境変数から取得）
    const pythonApiUrl = process.env.PYTHON_API_URL || 'http://python-api:8000';
    const endpoint = `${pythonApiUrl}/api/correspondence/analyze`;
    
    // FastAPI にリクエストを転送
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      return NextResponse.json(
        { error: errorData.error || 'Analysis failed' },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('API Route Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // FastAPI から利用可能な手法一覧を取得
    const pythonApiUrl = process.env.PYTHON_API_URL || 'http://python-api:8000';
    const endpoint = `${pythonApiUrl}/api/correspondence/methods`;
    
    const response = await fetch(endpoint);
    
    if (!response.ok) {
      throw new Error('Failed to fetch methods');
    }
    
    const data = await response.json();
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('API Route Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch methods' },
      { status: 500 }
    );
  }
}