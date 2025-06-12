// app/api/timeseries/methods/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const fastApiUrl = process.env.FASTAPI_URL || process.env.PYTHON_API_URL || 'http://python-api:8000';
    console.log('🔗 Getting timeseries methods from:', fastApiUrl);
    
    const response = await fetch(`${fastApiUrl}/api/timeseries/methods`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ FastAPI methods error:', errorText);
      return NextResponse.json(
        { error: '時系列分析手法の取得に失敗しました', details: errorText },
        { status: response.status }
      );
    }

    const result = await response.json();
    console.log('✅ Timeseries methods retrieved successfully');
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('❌ Timeseries methods error:', error);
    return NextResponse.json(
      { 
        error: '時系列分析手法の取得中にエラーが発生しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}