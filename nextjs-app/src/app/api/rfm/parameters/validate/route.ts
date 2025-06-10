// 📁 app/api/rfm/parameters/validate/route.ts (改良版)
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();
    
    // 基本的なクライアントサイド検証
    const customerIdCol = searchParams.get('customer_id_col');
    const dateCol = searchParams.get('date_col');
    const amountCol = searchParams.get('amount_col');
    
    if (!customerIdCol || !dateCol || !amountCol) {
      return NextResponse.json({
        valid: false,
        errors: ['必須パラメータが不足しています'],
        warnings: []
      });
    }
    
    const fastApiUrl = process.env.FASTAPI_URL || 'http://python-api:8000';
    console.log('🔗 Validating RFM parameters:', fastApiUrl);
    console.log('📋 Parameters:', Object.fromEntries(searchParams.entries()));
    
    const response = await fetch(`${fastApiUrl}/api/rfm/parameters/validate?${queryString}`, {
      signal: AbortSignal.timeout(10000), // 10秒
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ FastAPI validation error:', errorText);
      throw new Error(`FastAPI request failed: ${response.statusText}`);
    }

    const validation = await response.json();
    console.log('✅ RFM parameters validated successfully');
    console.log('📊 Validation result:', validation);
    
    return NextResponse.json(validation);
    
  } catch (error) {
    console.error('❌ RFM parameter validation error:', error);
    
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({
        valid: false,
        errors: ['リクエストがタイムアウトしました'],
        warnings: []
      }, { status: 504 });
    }
    
    return NextResponse.json({
      valid: false,
      errors: ['RFMパラメータ検証に失敗しました'],
      warnings: [],
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}