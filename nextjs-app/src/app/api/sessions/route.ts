// app/api/sessions/route.ts
import { NextRequest, NextResponse } from 'next/server';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://python-api:8000';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'default';
    const search = searchParams.get('search');
    const tags = searchParams.get('tags');
    const limit = searchParams.get('limit') || '20';
    const offset = searchParams.get('offset') || '0';

    // Python APIに転送するためのURLパラメータを構築
    const params = new URLSearchParams({
      user_id: userId,
      limit,
      offset,
    });
    
    if (search) params.append('search', search);
    if (tags) params.append('tags', tags);

    // Python APIを呼び出し
    const response = await fetch(`${PYTHON_API_URL}/sessions?${params.toString()}`, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Python API Error:', errorText);
      return NextResponse.json(
        { error: 'セッション取得中にエラーが発生しました' },
        { status: 500 }
      );
    }

    const sessionsData = await response.json();
    return NextResponse.json(sessionsData);

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}