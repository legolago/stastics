// 📁 app/api/rfm/parameters/validate/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();
    
    const fastApiUrl = process.env.FASTAPI_URL || 'http://python-api:8000';
    console.log('🔗 Validating RFM parameters:', fastApiUrl);
    
    const response = await fetch(`${fastApiUrl}/api/rfm/parameters/validate?${queryString}`);

    if (!response.ok) {
      throw new Error(`FastAPI request failed: ${response.statusText}`);
    }

    const validation = await response.json();
    console.log('✅ RFM parameters validated successfully');
    return NextResponse.json(validation);
    
  } catch (error) {
    console.error('❌ RFM parameter validation error:', error);
    return NextResponse.json(
      { error: 'RFMパラメータ検証に失敗しました' },
      { status: 500 }
    );
  }
}
