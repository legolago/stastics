// app/api/regression/parameters/validate/route.ts
import { NextRequest, NextResponse } from 'next/server';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://python-api:8000';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();
    
    console.log('🔗 Validating regression parameters:', PYTHON_API_URL);
    console.log('📋 Parameters:', Object.fromEntries(searchParams));
    
    const response = await fetch(`${PYTHON_API_URL}/api/regression/parameters/validate?${queryString}`);

    if (!response.ok) {
      throw new Error(`FastAPI request failed: ${response.statusText}`);
    }

    const validation = await response.json();
    console.log('✅ Regression parameters validated successfully');
    console.log('📊 Validation result:', validation);
    
    return NextResponse.json(validation);
    
  } catch (error) {
    console.error('❌ Parameter validation error:', error);
    return NextResponse.json(
      { 
        valid: false,
        error: 'パラメータ検証に失敗しました',
        errors: ['サーバーとの通信に失敗しました']
      },
      { status: 500 }
    );
  }
}