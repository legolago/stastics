import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'default';
    const limit = searchParams.get('limit') || '50';
    const offset = searchParams.get('offset') || '0';
    const search = searchParams.get('search') || '';

    console.log('🔍 TimeSeries sessions request:', {
      userId,
      limit,
      offset,
      search
    });

    // FastAPIの時系列分析専用エンドポイントを呼び出し
    const params = new URLSearchParams({
      user_id: userId,
      limit,
      offset
    });

    if (search) {
      params.append('search', search);
    }

    // Docker Composeの環境変数を使用
    const pythonApiUrl = process.env.PYTHON_API_URL || 'http://localhost:8000';
    
    const response = await fetch(`${pythonApiUrl}/api/timeseries/sessions?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error('❌ FastAPI error:', response.status, response.statusText);
      return NextResponse.json(
        { success: false, error: `FastAPI error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('📊 FastAPI response:', {
      success: data.success,
      dataLength: data.data?.length || 0,
      sampleSession: data.data?.[0] ? Object.keys(data.data[0]) : null
    });

    return NextResponse.json(data);

  } catch (error) {
    console.error('❌ TimeSeries sessions API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}