// app/api/regression/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    // Docker環境では python-api サービス名を使用（因子分析と同じ）
    const fastApiUrl = process.env.FASTAPI_URL || process.env.PYTHON_API_URL || 'http://python-api:8000';
    
    console.log('🔗 FastAPI URL:', fastApiUrl);
    console.log('📤 Sending regression analysis request...');
    console.log('📋 Request params:', request.nextUrl.searchParams.toString());
    
    const response = await fetch(`${fastApiUrl}/api/regression/analyze?${request.nextUrl.searchParams.toString()}`, {
      method: 'POST',
      body: formData,
    });

    console.log('📥 FastAPI Response Status:', response.status);
    console.log('📋 Response Headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ FastAPI error:', errorText);
      
      // エラーレスポンスのパース試行
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { detail: errorText };
      }
      
      return NextResponse.json(
        { 
          success: false, 
          error: '回帰分析に失敗しました', 
          details: errorData.detail || errorText,
          debug: {
            status: response.status,
            statusText: response.statusText
          }
        },
        { status: response.status }
      );
    }

    // レスポンステキストを先に取得（因子分析と同じパターン）
    const responseText = await response.text();
    console.log('📄 Raw Response Text (first 1000 chars):', responseText.substring(0, 1000));
    console.log('📏 Response Text Length:', responseText.length);

    // JSONパースを試行
    let result;
    try {
      if (responseText.trim() === '') {
        console.log('⚠️ Empty response from FastAPI');
        return NextResponse.json({
          success: false,
          error: 'FastAPIからの応答が空です'
        }, { status: 500 });
      }

      result = JSON.parse(responseText);
      console.log('✅ JSON parse successful');
      console.log('📊 Result type:', typeof result);
      console.log('📊 Result is null?', result === null);
      console.log('📊 Result is undefined?', result === undefined);
      
      if (result && typeof result === 'object') {
        console.log('📊 Result keys:', Object.keys(result));
        console.log('📊 Session ID in result:', result.session_id);
      }
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError);
      console.error('📄 Failed to parse text:', responseText);
      
      // 因子分析と同様のフォールバック処理
      if (responseText.includes('=== 回帰分析API処理完了 ===') || 
          responseText.includes('回帰分析が完了しました') || 
          response.status === 200) {
        console.log('🔄 Applying fallback: treating as successful analysis');
        
        // 最低限の成功レスポンスを生成
        result = {
          success: true,
          session_id: Date.now(), // 一時的なセッションID
          session_name: '回帰分析',
          analysis_type: 'regression',
          message: '分析は完了しましたが、詳細結果の取得に問題があります。セッション履歴から結果を確認してください。',
          status: 'success'
        };
        
        console.log('🔄 Fallback result created:', result);
      } else {
        return NextResponse.json({
          success: false,
          error: 'FastAPIからの応答を解析できませんでした',
          details: parseError instanceof Error ? parseError.message : 'Parse error',
          debug: {
            responseText: responseText.substring(0, 500),
            parseError: parseError instanceof Error ? parseError.message : 'Unknown parse error'
          }
        }, { status: 500 });
      }
    }
    
    console.log('✅ Regression analysis completed successfully');
    
    // FastAPIからの結果を確認し、successプロパティを追加（因子分析と同じロジック）
    if (result && typeof result === 'object' && result !== null) {
      // すでにsuccessプロパティがある場合はそのまま
      if (!('success' in result)) {
        result.success = true;
        console.log('➕ Added success property to result');
      }
      
      // session_idが存在することを確認
      if (!result.session_id) {
        if (result.data?.session_id) {
          result.session_id = result.data.session_id;
          console.log('➕ Added session_id from data to result:', result.session_id);
        } else if (result.metadata?.session_id) {
          result.session_id = result.metadata.session_id;
          console.log('➕ Added session_id from metadata to result:', result.session_id);
        } else {
          console.log('⚠️ No session_id found in result');
        }
      }
      
      // session_idが0の場合は警告
      if (result.session_id === 0) {
        console.warn('⚠️ Warning: session_id is 0, this may indicate a database save issue');
        // 0の場合でもエラーとはせず、警告として扱う
        result.warning = 'セッションIDが0です。データベース保存に問題がある可能性があります。';
      }
      
      console.log('📤 Returning result with success:', result.success, 'session_id:', result.session_id);
      return NextResponse.json(result);
    } else {
      console.error('❌ Invalid result format:', result);
      console.error('📊 Result type:', typeof result);
      console.error('📊 Result value:', result);
      
      return NextResponse.json({
        success: false,
        error: '無効なレスポンス形式です',
        debug: {
          resultType: typeof result,
          resultValue: result,
          responseLength: responseText.length,
          responsePreview: responseText.substring(0, 200)
        }
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('❌ Regression analysis error:', error);
    
    // 接続エラーの詳細情報（因子分析と同じ）
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        cause: error.cause,
        stack: error.stack
      });
    }
    
    return NextResponse.json(
      { 
        success: false,
        error: 'サーバーエラーが発生しました', 
        details: error instanceof Error ? error.message : 'Unknown error',
        debug: {
          fastApiUrl: process.env.FASTAPI_URL || process.env.PYTHON_API_URL || 'http://python-api:8000',
          timestamp: new Date().toISOString(),
          errorType: error instanceof Error ? error.constructor.name : typeof error
        }
      },
      { status: 500 }
    );
  }
}