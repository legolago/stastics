// app/api/timeseries/sessions/[sessionId]/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const sessionId = params.sessionId;
    
    // セッションIDの検証
    if (!sessionId || isNaN(Number(sessionId))) {
      return NextResponse.json(
        { error: '無効なセッションIDです' },
        { status: 400 }
      );
    }
    
    const fastApiUrl = process.env.FASTAPI_URL || process.env.PYTHON_API_URL || 'http://python-api:8000';
    console.log(`🔗 Getting timeseries session ${sessionId} from:`, fastApiUrl);
    
    const response = await fetch(`${fastApiUrl}/api/timeseries/sessions/${sessionId}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ FastAPI session error:', errorText);
      
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'セッションが見つかりません' },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { error: 'セッション情報の取得に失敗しました', details: errorText },
        { status: response.status }
      );
    }

    // レスポンステキストを先に取得
    const responseText = await response.text();
    console.log('📄 Session Response Text Length:', responseText.length);

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
      console.log('✅ Session JSON parse successful');
      
      if (result && typeof result === 'object') {
        console.log('📊 Session result keys:', Object.keys(result));
      }
    } catch (parseError) {
      console.error('❌ Session JSON parse error:', parseError);
      console.error('📄 Failed to parse text:', responseText.substring(0, 500));
      
      return NextResponse.json({
        success: false,
        error: 'セッション情報の解析に失敗しました',
        details: parseError instanceof Error ? parseError.message : 'Parse error'
      }, { status: 500 });
    }
    
    console.log(`✅ Timeseries session ${sessionId} retrieved successfully`);
    
    // 結果を確認し、successプロパティを追加
    if (result && typeof result === 'object' && result !== null) {
      if (!('success' in result)) {
        result.success = true;
        console.log('➕ Added success property to session result');
      }
      
      return NextResponse.json(result);
    } else {
      console.error('❌ Invalid session result format:', result);
      
      return NextResponse.json({
        success: false,
        error: '無効なセッション情報形式です',
        debug: {
          resultType: typeof result,
          resultValue: result
        }
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('❌ Timeseries session error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'セッション情報の取得中にエラーが発生しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
export async function DELETE(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const sessionId = params.sessionId;
    
    // セッションIDの検証
    if (!sessionId || isNaN(Number(sessionId))) {
      return NextResponse.json(
        { error: '無効なセッションIDです' },
        { status: 400 }
      );
    }
    
    const fastApiUrl = process.env.FASTAPI_URL || process.env.PYTHON_API_URL || 'http://python-api:8000';
    console.log(`🗑️ Deleting timeseries session ${sessionId} from:`, fastApiUrl);
    
    const response = await fetch(`${fastApiUrl}/api/timeseries/sessions/${sessionId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ FastAPI session delete error:', errorText);
      
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'セッションが見つかりません' },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { error: 'セッションの削除に失敗しました', details: errorText },
        { status: response.status }
      );
    }

    console.log(`✅ Timeseries session ${sessionId} deleted successfully`);
    
    return NextResponse.json({ success: true, message: 'セッションが削除されました' });
    
  } catch (error) {
    console.error('❌ Timeseries session delete error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'セッション削除中にエラーが発生しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}