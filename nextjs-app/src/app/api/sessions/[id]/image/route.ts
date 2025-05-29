// app/api/sessions/[id]/image/route.ts
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
    
    // Python APIから画像を取得
    const response = await fetch(`${PYTHON_API_URL}/sessions/${sessionId}/image`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Python API Error:', errorText);
      return NextResponse.json(
        { error: '画像取得エラー' },
        { status: response.status }
      );
    }

    // レスポンスヘッダーとボディをそのまま転送
    const contentType = response.headers.get('content-type') || 'image/png';
    const contentDisposition = response.headers.get('content-disposition') || `attachment; filename=analysis_${sessionId}_plot.png`;
    const imageBuffer = await response.arrayBuffer();

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': contentDisposition,
      },
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}