
'use client';
import React, { useState } from 'react';

const ExtendedIconSamplesDemo = () => {
  const [activeCategory, setActiveCategory] = useState('data');

  // データ・分析系アイコン（拡張版）
  const dataIcons = [
    {
      name: "棒グラフ（現在使用中）",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
    },
    {
      name: "円グラフ",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
        </svg>
      )
    },
    {
      name: "折れ線グラフ",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
        </svg>
      )
    },
    {
      name: "面グラフ",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )
    },
    {
      name: "統計・計算機",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      )
    },
    {
      name: "トレンド分析",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      )
    },
    {
      name: "データポイント",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 21l4-4 4 4" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18" />
        </svg>
      )
    },
    {
      name: "散布図",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="8" cy="8" r="2" />
          <circle cx="16" cy="12" r="2" />
          <circle cx="12" cy="16" r="2" />
          <circle cx="6" cy="16" r="2" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h18v18" />
        </svg>
      )
    },
    {
      name: "レーダーチャート",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          <polygon points="12,6 18,9.5 18,14.5 12,18 6,14.5 6,9.5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
        </svg>
      )
    },
    {
      name: "ヒートマップ",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="3" width="5" height="5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          <rect x="10" y="3" width="5" height="5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          <rect x="17" y="3" width="4" height="5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          <rect x="3" y="10" width="5" height="5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          <rect x="10" y="10" width="5" height="5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          <rect x="17" y="10" width="4" height="5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          <rect x="3" y="17" width="5" height="4" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          <rect x="10" y="17" width="5" height="4" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          <rect x="17" y="17" width="4" height="4" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
        </svg>
      )
    },
    {
      name: "相関分析",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v16h16" />
          <circle cx="8" cy="16" r="1" />
          <circle cx="10" cy="14" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="14" cy="10" r="1" />
          <circle cx="16" cy="8" r="1" />
          <circle cx="18" cy="6" r="1" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 17l12-12" />
        </svg>
      )
    },
    {
      name: "多次元分析",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4a1 1 0 011-1h4M4 16v4a1 1 0 001 1h4m8-16h4a1 1 0 011 1v4m-4 12h4a1 1 0 001-1v-4" />
          <circle cx="12" cy="12" r="3" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v6m3-3H9" />
        </svg>
      )
    }
  ];

  // ナビゲーション系アイコン（拡張版）
  const navIcons = [
    {
      name: "ホーム",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      )
    },
    {
      name: "ダッシュボード",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      )
    },
    {
      name: "左矢印（戻る）",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      )
    },
    {
      name: "右矢印（進む）",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
      )
    },
    {
      name: "上矢印",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
      )
    },
    {
      name: "メニュー（3本線）",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      )
    },
    {
      name: "グリッドメニュー",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
      )
    },
    {
      name: "ナビゲーション",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <polygon points="3,11 22,2 13,21 11,13" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
        </svg>
      )
    },
    {
      name: "コンパス",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
        </svg>
      )
    },
    {
      name: "サイドバー",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="2" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v18" />
        </svg>
      )
    },
    {
      name: "タブ",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      )
    },
    {
      name: "ブックマーク",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
      )
    }
  ];

  // ツール・機能系アイコン（拡張版）
  const toolIcons = [
    {
      name: "設定・歯車",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    },
    {
      name: "検索",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      )
    },
    {
      name: "フィルター",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
      )
    },
    {
      name: "アップロード",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      )
    },
    {
      name: "ダウンロード",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      )
    },
    {
      name: "編集",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      )
    },
    {
      name: "削除",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      )
    },
    {
      name: "コピー",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )
    },
    {
      name: "保存",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
        </svg>
      )
    },
    {
      name: "共有",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
      )
    },
    {
      name: "リフレッシュ",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      )
    },
    {
      name: "情報",
      component: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    }
  ];

  // 絵文字アイコン（拡張版）
  const emojiIcons = [
    { name: "ホーム", emoji: "🏠" },
    { name: "棒グラフ", emoji: "📊" },
    { name: "上昇グラフ", emoji: "📈" },
    { name: "下降グラフ", emoji: "📉" },
    { name: "虫眼鏡", emoji: "🔍" },
    { name: "歯車", emoji: "⚙️" },
    { name: "的", emoji: "🔍" },
    { name: "クリップボード", emoji: "📋" },
    { name: "電球", emoji: "💡" },
    { name: "ロケット", emoji: "🚀" },
    { name: "星", emoji: "⭐" },
    { name: "炎", emoji: "🔥" },
    { name: "ダイヤモンド", emoji: "💎" },
    { name: "王冠", emoji: "👑" },
    { name: "トロフィー", emoji: "🏆" },
    { name: "メダル", emoji: "🏅" },
    { name: "稲妻", emoji: "⚡" },
    { name: "ハート", emoji: "❤️" },
    { name: "チェックマーク", emoji: "✅" },
    { name: "警告", emoji: "⚠️" },
    { name: "情報", emoji: "ℹ️" },
    { name: "質問", emoji: "❓" },
    { name: "感嘆符", emoji: "❗" },
    { name: "禁止", emoji: "🚫" }
  ];

  const categories = [
    { id: 'data', name: 'データ・分析系', count: dataIcons.length, emoji: '📊' },
    { id: 'nav', name: 'ナビゲーション系', count: navIcons.length, emoji: '🧭' },
    { id: 'tool', name: 'ツール・機能系', count: toolIcons.length, emoji: '🔧' },
    { id: 'emoji', name: '絵文字アイコン', count: emojiIcons.length, emoji: '🎨' }
  ];

  const getCurrentIcons = () => {
    switch (activeCategory) {
      case 'data': return dataIcons;
      case 'nav': return navIcons;
      case 'tool': return toolIcons;
      case 'emoji': return emojiIcons;
      default: return dataIcons;
    }
  };

  const IconCard = ({ name, children, isEmoji = false }) => (
    <div className="bg-white rounded-lg shadow-md p-6 text-center hover:shadow-lg transition-shadow border">
      <div className={`flex justify-center mb-3 ${isEmoji ? 'text-5xl' : 'text-indigo-600'}`}>
        {children}
      </div>
      <h3 className="text-sm font-medium text-gray-900">{name}</h3>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            アイコンサンプル集（拡張版）
          </h1>
          <p className="text-lg text-gray-600">
            各カテゴリにはもっとたくさんのアイコンがあります！
          </p>
        </div>

        {/* カテゴリタブ */}
        <div className="mb-8">
          <div className="flex flex-wrap justify-center gap-4">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={`flex items-center px-6 py-3 rounded-lg font-medium transition-colors ${
                  activeCategory === category.id
                    ? 'bg-indigo-600 text-white shadow-lg'
                    : 'bg-white text-gray-700 hover:bg-indigo-50'
                }`}
              >
                <span className="mr-2 text-xl">{category.emoji}</span>
                {category.name}
                <span className="ml-2 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                  {category.count}個
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 現在のカテゴリのアイコン表示 */}
        <div className="mb-12">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              {categories.find(cat => cat.id === activeCategory)?.emoji} {' '}
              {categories.find(cat => cat.id === activeCategory)?.name}
            </h2>
            <p className="text-gray-600 mt-2">
              {getCurrentIcons().length}個のアイコンが利用可能です
            </p>
          </div>

          <div className={`grid gap-6 ${
            activeCategory === 'emoji' 
              ? 'grid-cols-4 md:grid-cols-6 lg:grid-cols-8' 
              : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
          }`}>
            {getCurrentIcons().map((icon, index) => (
              <IconCard 
                key={index} 
                name={icon.name} 
                isEmoji={activeCategory === 'emoji'}
              >
                {activeCategory === 'emoji' ? icon.emoji : icon.component}
              </IconCard>
            ))}
          </div>
        </div>

        {/* 使用方法の説明 */}
        <div className="bg-white rounded-lg shadow-md p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">使用方法</h2>
          <div className="prose text-gray-600">
            <p className="mb-4">
              これらのアイコンをあなたのコードで使用するには、該当するSVGコードまたは絵文字を
              <code className="bg-gray-100 px-2 py-1 rounded">icon:</code> プロパティに設定してください。
            </p>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">SVGアイコンの使用例</h3>
                <pre className="text-sm bg-gray-800 text-green-400 p-3 rounded overflow-x-auto">
                {`icon: (
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                ),`}
                </pre>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">絵文字アイコンの使用例</h3>
                <pre className="text-sm bg-gray-800 text-green-400 p-3 rounded overflow-x-auto">
                {`icon: "🏠",`}
                </pre>
              </div>
            </div>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-semibold text-blue-900 mb-2">💡 豊富なバリエーション</h3>
              <ul className="text-blue-800 space-y-1">
                <li>• <strong>データ・分析系:</strong> {dataIcons.length}個のアイコン</li>
                <li>• <strong>ナビゲーション系:</strong> {navIcons.length}個のアイコン</li>
                <li>• <strong>ツール・機能系:</strong> {toolIcons.length}個のアイコン</li>
                <li>• <strong>絵文字:</strong> {emojiIcons.length}個のアイコン</li>
                <li>• <strong>合計:</strong> {dataIcons.length + navIcons.length + toolIcons.length + emojiIcons.length}個以上のアイコンが利用可能！</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExtendedIconSamplesDemo;