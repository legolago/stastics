// app/api/sessions/[id]/csv/route.ts
import { NextRequest, NextResponse } from 'next/server';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://python-api:8000';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: sessionId } = await params;
    
    console.log(`Fetching CSV for session: ${sessionId}`);
    
    // 直接セッションのCSVエンドポイントを使用
    const csvUrl = `${PYTHON_API_URL}/api/sessions/${sessionId}/csv`;
    console.log(`Fetching CSV from: ${csvUrl}`);
    
    const response = await fetch(csvUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Python API Error:', errorText);
      return NextResponse.json(
        { error: 'CSV取得エラー', details: errorText },
        { status: response.status }
      );
    }

    // レスポンスヘッダーとボディをそのまま転送
    const contentType = response.headers.get('content-type') || 'text/csv';
    const contentDisposition = response.headers.get('content-disposition') || `attachment; filename=analysis_${sessionId}.csv`;
    const csvData = await response.text();

    return new NextResponse(csvData, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': contentDisposition,
      },
    });

  } catch (error) {
    console.error('CSV API Error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}