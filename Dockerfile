# ベースイメージとしてJupyterのデータサイエンス向けイメージを使用
FROM jupyter/datascience-notebook:latest

# 権限問題を解決するため、明示的にrootユーザーに切り替え
USER root

# システムライブラリをインストール
RUN apt-get update && apt-get install -y --no-install-recommends \
    sudo \
    file \
    build-essential \
    cmake \
    git \
    curl \
    vim \
    wget \
    ca-certificates \
    libjpeg-dev \
    libpng-dev \
    mecab \
    libmecab-dev \
    mecab-ipadic-utf8 \
    graphviz \
    libgraphviz-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# jovyanユーザーがパスワードなしでsudoを使えるようにする
RUN echo "jovyan ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# NB_UIDユーザーに戻る（通常はjovyanユーザー）
USER ${NB_UID}

# 多変量解析に必要なPythonパッケージをインストール
RUN pip install --no-cache-dir \
    # 基本的な統計・機械学習ライブラリ
    scikit-learn \
    statsmodels \
    # 因子分析用
    factor_analyzer \
    # クラスター分析の拡張
    hdbscan \
    kmodes \
    pyclustering \
    # 次元削減・主成分分析の拡張
    umap-learn \
    prince \
    # 可視化ライブラリ
    seaborn \
    plotly \
    bokeh \
    holoviews \
    matplotlib-venn \
    japanize-matplotlib \
    # データベース接続
    psycopg2-binary \
    sqlalchemy \
    # 並列処理・パフォーマンス向上
    joblib \
    dask \
    # 解釈可能性向上のためのツール
    eli5 \
    shap \
    # Rとの連携
    rpy2 \
    # グラフ理論用
    networkx \
    pygraphviz \
    # 日本語テキスト処理
    mecab-python3 \
    ipadic \
    unidic-lite \
    neologdn \
    mojimoji \
    fugashi \
    chardet \
    adjustText \
    # Excel操作
    openpyxl \
    # ウィジェット（基本的なインタラクティブ機能用）
    ipywidgets

USER root

# NEologdインストール
RUN apt-get update && apt-get install -y git curl wget && \
    git clone --depth 1 https://github.com/neologd/mecab-ipadic-neologd.git && \
    cd mecab-ipadic-neologd && \
    ./bin/install-mecab-ipadic-neologd -n -y && \
    cd .. && \
    rm -rf mecab-ipadic-neologd && \
    # インストールされた辞書を確認して設定
    NEOLOGD_PATH=$(find / -name "mecab-ipadic-neologd" -type d | head -n 1) && \
    if [ -n "$NEOLOGD_PATH" ]; then \
        echo "dicdir = $NEOLOGD_PATH" > /etc/mecabrc; \
    fi

USER ${NB_UID}


# 環境変数の調整
ENV LC_ALL C.UTF-8
ENV LANG C.UTF-8

# 作業ディレクトリを設定
WORKDIR /home/jovyan/work

# コンテナ起動時に実行するコマンド（クラシックなJupyter Notebookを使用）
CMD ["start-notebook.sh", "--NotebookApp.token=''", "--NotebookApp.password=''", "--NotebookApp.terminado_settings={'shell_command': ['/bin/bash']}", "--NotebookApp.default_url=/tree"]