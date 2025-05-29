// app/api/sessions/[id]/analysis-csv/route.ts

import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionId = params.id;
    console.log(`Fetching analysis CSV for session: ${sessionId}`);
    
    // Python APIから分析結果CSVを取得
    const pythonApiUrl = `http://python-api:8000/sessions/${sessionId}/analysis-csv`;
    console.log(`Fetching analysis CSV from: ${pythonApiUrl}`);
    
    const response = await fetch(pythonApiUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Python API Error: ${errorText}`);
      return NextResponse.json(
        { error: 'Python APIからデータを取得できませんでした' },
        { status: response.status }
      );
    }

    // CSVデータを取得
    const csvData = await response.arrayBuffer();
    
    // Content-Dispositionヘッダーを取得
    const contentDisposition = response.headers.get('Content-Disposition');
    
    // レスポンスを返す
    const headers = new Headers({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': contentDisposition || `attachment; filename="analysis_result_${sessionId}.csv"`
    });

    return new NextResponse(csvData, {
      status: 200,
      headers
    });

  } catch (error) {
    console.error('Analysis CSV API Error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}