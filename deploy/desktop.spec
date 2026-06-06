# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['desktop_main.py'],
    pathex=['.'],
    binaries=[],
    datas=[
        ('app/templates', 'app/templates'),
        ('app/static', 'app/static'),
    ],
    hiddenimports=[
        # uvicorn submodules (dynamic imports)
        'uvicorn.logging',
        'uvicorn.loops.auto',
        'uvicorn.loops.asyncio',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.middleware.wsgi',
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        # starlette
        'starlette.routing',
        'starlette.middleware',
        'starlette.staticfiles',
        'starlette.templating',
        # openpyxl
        'openpyxl.cell',
        'openpyxl.reader.excel',
        'openpyxl.writer.excel',
        'openpyxl.styles',
        # pydantic
        'pydantic',
        'pydantic._internal',
        'pydantic.fields',
        # jinja2
        'jinja2.ext',
        'jinja2.loaders',
        # app package
        'app',
        'app.main',
        'app.models',
        'app.services',
        'app.services.generator',
        'app.services.exporter',
        # SDKs
        'anthropic',
        'openai',
        # misc
        'dotenv',
        'python_multipart',
        'httpcore',
        'httpx',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='TestForge',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='TestForge',
)
