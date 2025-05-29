// app/api/sessions/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionId = params.id;
    console.log(`Fetching session details: ${sessionId}`);
    
    // Python APIからセッション詳細を取得
    const pythonApiUrl = `http://python-api:8000/sessions/${sessionId}`;
    const response = await fetch(pythonApiUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Python API Error: ${errorText}`);
      return NextResponse.json(
        { error: 'Python APIからデータを取得できませんでした' },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Session detail API Error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionId = params.id;
    console.log(`Deleting session: ${sessionId}`);
    
    // Python APIでセッションを削除
    const pythonApiUrl = `http://python-api:8000/sessions/${sessionId}`;
    const response = await fetch(pythonApiUrl, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Python API Error: ${errorText}`);
      return NextResponse.json(
        { error: 'セッションの削除に失敗しました' },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      message: 'セッションが削除されました'
    });

  } catch (error) {
    console.error('Session delete API Error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionId = params.id;
    const body = await request.json();
    console.log(`Updating session: ${sessionId}`, body);
    
    // クエリパラメータを構築
    const searchParams = new URLSearchParams();
    if (body.session_name) searchParams.append('session_name', body.session_name);
    if (body.description) searchParams.append('description', body.description);
    if (body.tags) searchParams.append('tags', body.tags);
    
    // Python APIでセッションを更新
    const pythonApiUrl = `http://python-api:8000/sessions/${sessionId}?${searchParams.toString()}`;
    const response = await fetch(pythonApiUrl, {
      method: 'PUT',
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Python API Error: ${errorText}`);
      return NextResponse.json(
        { error: 'セッションの更新に失敗しました' },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json(data);

  } catch (error) {
    console.error('Session update API Error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}