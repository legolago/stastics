// app/api/sessions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://python-api:8000';

interface RouteParams {
  params: {
    id: string;
  };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionId = params.id;

    // Python APIを呼び出し
    const response = await fetch(`${PYTHON_API_URL}/sessions/${sessionId}`, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Python API Error:', errorText);
      return NextResponse.json(
        { error: 'セッション詳細取得中にエラーが発生しました' },
        { status: response.status }
      );
    }

    const sessionDetail = await response.json();
    return NextResponse.json(sessionDetail);

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionId = params.id;

    // Python APIを呼び出し
    const response = await fetch(`${PYTHON_API_URL}/sessions/${sessionId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Python API Error:', errorText);
      return NextResponse.json(
        { error: 'セッション削除中にエラーが発生しました' },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionId = params.id;
    const { searchParams } = new URL(request.url);
    const sessionName = searchParams.get('sessionName');
    const description = searchParams.get('description');
    const tags = searchParams.get('tags');

    // Python APIに転送するためのURLパラメータを構築
    const updateParams = new URLSearchParams();
    if (sessionName) updateParams.append('session_name', sessionName);
    if (description) updateParams.append('description', description);
    if (tags) updateParams.append('tags', tags);

    // Python APIを呼び出し
    const response = await fetch(`${PYTHON_API_URL}/sessions/${sessionId}?${updateParams.toString()}`, {
      method: 'PUT',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Python API Error:', errorText);
      return NextResponse.json(
        { error: 'セッション更新中にエラーが発生しました' },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}