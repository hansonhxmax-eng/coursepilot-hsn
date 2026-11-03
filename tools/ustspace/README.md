# USTSpace 本地可见页面采集工具

## 先说明当前验证范围

本工具在你自己的电脑打开浏览器，由你本人在 USTSpace 官网登录，不接收账号密码、验证码或 Cookie。它读取正常可见的课程页面文字，不调用猜测的私有接口，不导出登录信息。网站可能有页面结构、登录权限、robots 规则、限流、分页或反自动化限制；**尚未在真实已登录 USTSpace 页面验证兼容性，不能保证一键成功或采全所有评价**。如果学校/网站不允许这种使用，应停止并采用允许的导出方式。

已实现并测试的部分：课程代码校验、从已观察到的链接推导模板、文本处理、受限采集、部分结果保存和平台 JSON 导入。模拟页面测试不能替代真实网站验证。网页内容可能混有课程描述、非评论信息；平台将其显示为“页面证据”，不会自动生成评分或考勤结论。

## 准备

1. 安装 Python 3.10 或更新版本。
2. 解压此工具到你电脑的一个文件夹。
3. 在 CoursePilot 的 **Real schedules → USTSpace snapshots** 点击 **Download course codes**，把 `coursepilot-course-codes.json` 放入这个文件夹。文件包含课表中可明确识别的课程代码；模糊代码单独列出，不会猜测。
4. 在此文件夹打开终端（Windows 可使用 PowerShell），运行：

```sh
python -m pip install -r requirements.txt
python -m playwright install chromium
```

macOS/Linux 上如果命令叫 `python3`，将所有 `python` 替换为 `python3`。

## Windows 简易启动

如果你使用 Windows，安装 Python 后，可以双击 **Start-Windows.bat**。它会在工具文件夹创建独立的 `.venv`，安装依赖和浏览器，然后启动前三门课程的检查。根据电脑网络状况，首次下载浏览器需要等待。若系统询问脚本是否允许运行，请先查看脚本内容，确认来源是你自己的 CoursePilot 仓库；不要关闭系统安全功能。

脚本会提示你在弹出的浏览器亲自登录、打开第一门课程，再回终端按 Enter。这不是让我在聊天里接收你的密码。命令行也可使用下面的手动步骤。

## 先测试三门课程

```sh
python collect.py --courses coursepilot-course-codes.json --limit 3
```

- 工具打开独立的本地浏览器。
- 你亲自在官网登录，并打开终端提示的第一门课程的**评价详情页**。
- 回到终端按 Enter。工具读取页面内容，并仅从实际观察到的课程 URL 推导其他课程的路径；若无法推导，会尝试可见的搜索框和课程链接，不会猜接口。
- 默认每次操作至少间隔 4 秒，每门最多 20 个可见分页、每页最多 8 次滚动/载入。若出现验证码、登录失效、401/403/429 或 robots 禁止，工具停止并保存已有结果，不绕过限制。

打开生成的 `ustspace-snapshots.json`，确认三门课程的文字确实是对应课程的评价内容。如果是搜索结果、空白、课程简介或采集失败，请不要批量运行。可以把**脱敏后的输出片段或界面截图**交给开发者调整选择器，不要发送登录信息。

## 再处理全部课程

只有前三门数据确认正确且网站允许时，再运行：

```sh
python collect.py --courses coursepilot-course-codes.json --limit 0 --output ustspace-all-snapshots.json
```

`--limit 0` 表示尝试列表中的全部可识别课程，不表示保证采得每条评价。脚本逐门记录 captured/unavailable/failed；当前设置无法保证获取历史隐藏内容、所有分页或完整评论集合。首次不要增加并发或降低延时。中断时已有数据会保留。再次运行同名输出时，旧主文件会先保存为带时间戳的 backup 文件。大批量数据还会自动生成 `.part-001.json`、`.part-002.json` 等分片，便于分次导入网页；完整主文件也会保留。

若自动定位课程不适用，使用手动辅助模式：

```sh
python collect.py --courses coursepilot-course-codes.json --limit 3 --manual
```

在这个模式中，每门课程由你在浏览器打开正确页面，然后回终端按 Enter；工具负责受限读取、来源记录和保存。只有确认实际页面结构后才使用 `--search-selector`、`--content-selector` 或 `--url-template`；模板必须来自实际课程链接，包含 `{course}`（或者成对的 `{subject}`、`{number}`，保留已观察到的原路径格式），并保持在 ust.space 的 HTTPS 页面上。

## 导入平台

打开 CoursePilot 的 **Real schedules → USTSpace snapshots → Import USTSpace JSON**，选择采集结果；若主文件超过 20 MB，请分次选择生成的 part 分片。导入文字仅保存在当前网页标签页内存，刷新后清除，不会自动上传 GitHub。保留原 JSON，方便下次重新导入。

## 本地隐私与清理

`.venv/` 是本地 Python 工具依赖；`.ustspace-local-session/` 是独立的本地登录配置，可能包含登录状态。不要上传、同步或分享这个文件夹，也不要把密码、验证码、Cookie、请求头或完整 HAR 发到聊天里。采集 JSON 是可见网页文字：仍应检查是否含个人信息，再决定是否分享。工具会移除邮箱样式文本和明显的凭证字段，但这不是完整的匿名化保证。

退出脚本后，如不希望保留登录状态，可以删除 `.ustspace-local-session/`。网站登出也需要在浏览器中完成。删除本地文件不等于撤销网站端的所有会话。
