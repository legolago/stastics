// app/api/pca/parameters/validate/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();
    
    const fastApiUrl = process.env.FASTAPI_URL || 'http://python-api:8000';
    console.log('🔗 Validating PCA parameters:', fastApiUrl);
    
    const response = await fetch(`${fastApiUrl}/api/pca/parameters/validate?${queryString}`);

    if (!response.ok) {
      throw new Error(`FastAPI request failed: ${response.statusText}`);
    }

    const validation = await response.json();
    console.log('✅ PCA parameters validated successfully');
    return NextResponse.json(validation);
    
  } catch (error) {
    console.error('❌ Parameter validation error:', error);
    return NextResponse.json(
      { error: 'パラメータ検証に失敗しました' },
      { status: 500 }
    );
  }
}