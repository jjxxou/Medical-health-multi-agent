const chatMessages = document.getElementById('chat-messages');
const messageList = document.getElementById('message-list'); // Get the inner list
const historyList = document.getElementById('history-list');
const newChatButton = document.getElementById('new-chat-button');

// 添加导航元素选择器
const navItems = document.querySelectorAll('.nav-item');
const sectionChat = document.getElementById('section-chat');
const sectionIntro = document.getElementById('section-intro');
const sectionPrompts = document.getElementById('section-prompts');

// --- 配置你的 Coze API 信息 ---
const apiKey = "pat_TujwDEa6Nt28YbjfE2AHwjmxwxs0obREbxJGJ73vH96uDPOMkYxpq5g1NOwcvzTA"; // 替换为你的 API Key
const botId = "7493891125212725302"; // 替换为你的 Bot ID
const cozeApiUrl = "https://api.coze.cn/open_api/v2/chat";
// ------------------------------

// Update element selectors
const userInput = document.getElementById('user-input'); // Now a textarea
const sendButton = document.getElementById('send-button');
const attachmentButton = document.getElementById('attachment-button');
const fileInput = document.getElementById('file-input'); // Get the hidden file input
const attachmentPreview = document.getElementById('attachment-preview'); // Element for attachment preview

let conversationId = ""; // 用于存储会话 ID
let isWaitingForResponse = false; // 防止重复发送
let thinkingIndicatorElement = null; // Reference to the thinking indicator element
let currentHistory = []; // Array to hold the current session's history
const historyStorageKey = 'cozeChatHistory'; // Key for localStorage
let chatHistory = {}; // Object to hold all chat histories
let currentConversationId = null; // ID of the currently active conversation
let selectedFile = null; // Store the currently selected file
let currentSection = 'chat'; // 当前激活的部分

// --- 图片预览相关变量 ---
let previewModal = document.getElementById('image-preview-modal');
let previewImage = document.getElementById('preview-image');
let zoomInBtn = document.getElementById('zoom-in-btn');
let zoomOutBtn = document.getElementById('zoom-out-btn');
let rotateLeftBtn = document.getElementById('rotate-left-btn');
let rotateRightBtn = document.getElementById('rotate-right-btn');
let downloadBtn = document.getElementById('download-btn');
let closePreviewBtn = document.getElementById('close-preview-btn');
let currentScale = 1;
let currentRotation = 0;
let isDragging = false;
let startX, startY, translateX = 0, translateY = 0;

// Function to save history to localStorage
function saveChatHistory() {
    try {
        // Ensure chatHistory is not empty or null before saving
        if (chatHistory && Object.keys(chatHistory).length > 0) {
            localStorage.setItem(historyStorageKey, JSON.stringify(chatHistory));
            console.log("History saved:", chatHistory); // Add log
        } else {
            localStorage.removeItem(historyStorageKey); // Clear storage if history is empty
            console.log("History empty, storage cleared.");
        }
    } catch (e) {
        console.error("Failed to save history to localStorage:", e);
    }
}

// Function to load history from localStorage
function loadChatHistory() {
    try {
        const storedHistory = localStorage.getItem(historyStorageKey);
        console.log("Loading history from storage:", storedHistory ? 'Found' : 'Not Found'); // Add log
        if (storedHistory) {
            chatHistory = JSON.parse(storedHistory);
            // Basic validation if needed: ensure it's an object
            if (typeof chatHistory !== 'object' || chatHistory === null) {
                console.warn("Loaded history is not an object, resetting.");
                chatHistory = {};
            }
        } else {
            chatHistory = {};
        }
    } catch (e) {
        console.error("Failed to load or parse history from localStorage:", e);
        chatHistory = {};
        localStorage.removeItem(historyStorageKey); // Clear potentially corrupted data
    }
    renderHistoryList(); // Always render the list after loading
    
    // 修改这里：刷新页面后总是创建新对话
    startNewConversation(true);
}

// --- UI Rendering ---
function renderHistoryList() {
    if (!historyList) {
        console.error("History list element not found!");
        return;
    }
    historyList.innerHTML = ''; // Clear existing list
    console.log("Rendering history list with data:", chatHistory); // Add log
    const sortedKeys = Object.keys(chatHistory).sort((a, b) => parseInt(b.split('_')[1]) - parseInt(a.split('_')[1]));

    sortedKeys.forEach(convId => {
        const conversation = chatHistory[convId];
        // Add more robust check
        if (!conversation || typeof conversation !== 'object' || !Array.isArray(conversation.messages)) {
            console.warn(`Skipping invalid history entry: ${convId}`, conversation);
            return;
        }

        const listItem = document.createElement('li');
        
        // 创建span元素包裹文本内容
        const textSpan = document.createElement('span');
        textSpan.textContent = conversation.title || getConversationTitle(conversation.messages) || "Chat";
        textSpan.title = textSpan.textContent;
        listItem.appendChild(textSpan);
        
        listItem.dataset.convId = convId;

        if (convId === currentConversationId) {
            listItem.classList.add('active');
        }

        listItem.addEventListener('click', () => {
            loadConversation(convId);
        });

        // --- Modify Delete Button Creation ---
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-history-button';
        deleteButton.title = '删除对话';

        // Create and append the SVG image
        const trashImg = document.createElement('img');
        trashImg.src = 'image/trash.svg'; // Path to your trash icon
        trashImg.alt = 'Delete';
        deleteButton.appendChild(trashImg); // Add image to button

        deleteButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`确定要删除对话 "${textSpan.textContent}" 吗？`)) {
                deleteConversation(convId);
            }
        });
        listItem.appendChild(deleteButton);
        // --- End Delete Button Modification ---

        historyList.appendChild(listItem);
    });
    console.log("History list rendered."); // Add log
}

function updateActiveHistoryItem(activeConvId) {
    if (!historyList) return;
    historyList.querySelectorAll('li').forEach(li => {
        li.classList.toggle('active', li.dataset.convId === activeConvId);
    });
}

// --- Helper function for scrolling ---
function scrollToBottom() {
    // No longer needs 'immediate' parameter
    if (!chatMessages || !messageList.lastElementChild) {
        // Don't log error if list is simply empty
        if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight; // Fallback for empty list
        return;
    }

    // Use scrollIntoView on the last message/indicator element
    // Use requestAnimationFrame to ensure the element is rendered before scrolling
    requestAnimationFrame(() => {
        messageList.lastElementChild.scrollIntoView({ behavior: "smooth", block: "end" });
        console.log("Scrolled last element into view.");
    });
}

// --- Conversation Management ---
function loadConversation(convId) {
    if (!chatHistory[convId]) {
        console.error("Conversation not found:", convId);
        // Attempt to load the latest valid chat instead of starting new immediately
        const historyKeys = Object.keys(chatHistory).sort().reverse();
        if (historyKeys.length > 0) {
            loadConversation(historyKeys[0]);
        } else {
            startNewConversation(false); // Start new without adding welcome msg again if history is empty
        }
        return;
    }
    console.log("Loading conversation:", convId);
    currentConversationId = convId;
    conversationId = ""; // Reset Coze session ID when switching local chats
    const conversation = chatHistory[convId];

    // 先切换到聊天视图
    switchSection('chat');

    messageList.innerHTML = ''; // Clear message area
    // Render messages without saving
    conversation.messages.forEach(msg => addMessage(msg.sender, msg.text, false));

    updateActiveHistoryItem(convId); // Highlight the loaded chat in sidebar
    userInput.focus();

    // Scroll after rendering all messages
    // Use setTimeout to ensure all messages are added before scrolling
    setTimeout(scrollToBottom, 50); // Small delay after loop
}

function startNewConversation(addWelcome = true) {
    console.log("Starting new conversation...");
    messageList.innerHTML = ''; // 清除消息显示区域
    currentConversationId = null; // 重置当前本地会话ID
    conversationId = ""; // 重置Coze API会话ID
    updateActiveHistoryItem(null); // 取消选中历史列表中的任何选项

    // 确保切换到聊天区域
    switchSection('chat');

    if (addWelcome) {
        addMessage('bot', initialWelcomeMessage, false);
    }

    // 清空输入框和附件
    userInput.value = '';
    if (selectedFile) {
        removeSelectedFile();
    }
    
    userInput.focus();
    scrollToBottom();
    console.log("New conversation view ready.");
}

function deleteConversation(convId) {
    console.log("Deleting conversation:", convId);
    if (chatHistory[convId]) {
        delete chatHistory[convId];
        saveChatHistory(); // SAVE after deleting
        renderHistoryList(); // RENDER after deleting

        if (convId === currentConversationId) {
            console.log("Deleted active conversation. Loading another or starting new.");
            const historyKeys = Object.keys(chatHistory).sort((a, b) => parseInt(b.split('_')[1]) - parseInt(a.split('_')[1]));
            if (historyKeys.length > 0) {
                loadConversation(historyKeys[0]);
            } else {
                startNewConversation(true);
            }
        }
    } else {
        console.warn("Attempted to delete non-existent conversation:", convId);
    }
}

// 添加消息到聊天窗口
function addMessage(sender, text, save = true) {
    const messageWrapper = document.createElement('div'); // Outer wrapper for flex alignment (icon + content)
    messageWrapper.classList.add('message', sender);

    // 将原始文本作为数据属性存储在消息元素上（用于后续复制markdown）
    messageWrapper.dataset.originalText = text;

    // Add Bot Icon
    if (sender === 'bot') {
        const icon = document.createElement('img');
        icon.src = 'image/icon.jpg'; // 恢复使用原来的图标
        icon.alt = 'AI Icon';
        icon.className = 'bot-icon';
        messageWrapper.appendChild(icon);
    }

    // Create wrapper for bubble and copy button below it
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'message-content-wrapper';

    // Create the message bubble itself
    const messageBubble = document.createElement('div');
    messageBubble.className = 'message-bubble';

    // --- Populate Bubble Content ---
    if (sender === 'bot') {
        messageBubble.innerHTML = marked.parse(text);
        // 代码块处理
        const codeBlocks = messageBubble.querySelectorAll('pre');
        codeBlocks.forEach(pre => {
            // 获取当前 pre 元素内容
            const originalContent = pre.innerHTML;
            const codeElement = pre.querySelector('code');
            
            // 清空 pre 元素的内容，我们将重新构建它的结构
            pre.innerHTML = '';
            
            // 创建代码块标题栏
            const codeHeader = document.createElement('div');
            codeHeader.className = 'code-header';
            
            // 获取代码语言类型
            let codeType = 'code';
            if (codeElement) {
                const classNames = codeElement.className.split(' ');
                for (const className of classNames) {
                    if (className.startsWith('language-') || className.startsWith('lang-')) {
                        codeType = className.replace('language-', '').replace('lang-', '');
                        break;
                    }
                }
            }
            
            // 添加代码类型标签
            const typeLabel = document.createElement('div');
            typeLabel.className = 'code-type-label';
            typeLabel.textContent = codeType;
            codeHeader.appendChild(typeLabel);
            
            // 创建按钮容器
            const buttonsContainer = document.createElement('div');
            buttonsContainer.className = 'code-buttons-container';
            
            // 检查是否是HTML代码块
            const isHtml = codeElement && (
                codeElement.className.includes('language-html') || 
                codeElement.className.includes('lang-html') || 
                codeElement.className.includes('html')
            );
            
            if (isHtml) {
                // 添加HTML预览按钮
                const previewButton = document.createElement('button');
                previewButton.className = 'preview-html-button';
                previewButton.title = '预览HTML';
                
                // 使用eye图标
                const eyeIcon = document.createElement('img');
                eyeIcon.src = 'image/eye.svg';
                eyeIcon.alt = '预览';
                previewButton.appendChild(eyeIcon);
                
                // 添加预览功能
                previewButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    
                    // 获取HTML代码
                    const htmlCode = codeElement.innerText;
                    
                    // 创建预览弹窗
                    const previewOverlay = document.createElement('div');
                    previewOverlay.className = 'html-preview-overlay';
                    
                    // 创建内容容器
                    const previewContainer = document.createElement('div');
                    previewContainer.className = 'html-preview-container';
                    
                    // 创建标题栏
                    const titleBar = document.createElement('div');
                    titleBar.className = 'html-preview-title';
                    titleBar.innerHTML = '<span>HTML 预览</span>';
                    
                    // 添加关闭按钮
                    const closeButton = document.createElement('button');
                    closeButton.className = 'html-preview-close';
                    closeButton.innerHTML = '&times;';
                    closeButton.title = '关闭预览';
                    titleBar.appendChild(closeButton);
                    
                    // 创建iframe来安全地渲染HTML
                    const previewFrame = document.createElement('iframe');
                    previewFrame.className = 'html-preview-frame';
                    previewFrame.sandbox = 'allow-scripts allow-same-origin'; // Crucial for ECharts and other scripts
                    
                    // 将元素添加到DOM
                    previewContainer.appendChild(titleBar);
                    previewContainer.appendChild(previewFrame);
                    previewOverlay.appendChild(previewContainer);
                    document.body.appendChild(previewOverlay);
                    
                    // 直接将HTML代码设置到iframe的srcdoc属性中
                    previewFrame.srcdoc = htmlCode;
                    
                    // 处理关闭按钮点击
                    closeButton.addEventListener('click', () => {
                        document.body.removeChild(previewOverlay);
                        document.removeEventListener('keydown', handleEsc);
                    });
                    
                    // 点击遮罩层也可以关闭预览
                    previewOverlay.addEventListener('click', (event) => {
                        if (event.target === previewOverlay) {
                            document.body.removeChild(previewOverlay);
                            document.removeEventListener('keydown', handleEsc);
                        }
                    });
                    
                    // 按ESC键关闭预览
                    const handleEsc = (event) => {
                        if (event.key === 'Escape') {
                            document.body.removeChild(previewOverlay);
                            document.removeEventListener('keydown', handleEsc);
                        }
                    };
                    document.addEventListener('keydown', handleEsc);
                });
                
                // 添加预览按钮到容器
                buttonsContainer.appendChild(previewButton);
            }
            
            // 添加复制按钮
            const copyCodeButton = document.createElement('button');
            copyCodeButton.className = 'copy-code-button';
            copyCodeButton.title = '复制代码';
            
            // 使用SVG图标
            const copyIcon = document.createElement('img');
            copyIcon.src = 'image/copy.svg';
            copyIcon.alt = '复制';
            copyCodeButton.appendChild(copyIcon);
            
            copyCodeButton.addEventListener('click', (e) => {
                e.stopPropagation();
                const codeToCopy = codeElement ? codeElement.innerText : pre.textContent;
                navigator.clipboard.writeText(codeToCopy).then(() => {
                    // 隐藏原始图标
                    const originalDisplay = copyIcon.style.display;
                    copyIcon.style.display = 'none';
                    
                    // 创建成功提示（勾号）
                    const successIndicator = document.createElement('span');
                    successIndicator.textContent = '✓';
                    successIndicator.style.color = 'var(--accent-blue-primary)';
                    successIndicator.style.fontSize = '16px';
                    copyCodeButton.appendChild(successIndicator);
                    
                    // 2秒后恢复原始状态
                    setTimeout(() => {
                        copyCodeButton.removeChild(successIndicator);
                        copyIcon.style.display = originalDisplay;
                    }, 2000);
                }).catch(err => {
                    console.error('Failed to copy code: ', err);
                    // 显示失败提示
                    const originalDisplay = copyIcon.style.display;
                    copyIcon.style.display = 'none';
                    
                    const failIndicator = document.createElement('span');
                    failIndicator.textContent = '✗';
                    failIndicator.style.color = '#ff6b6b';
                    failIndicator.style.fontSize = '16px';
                    copyCodeButton.appendChild(failIndicator);
                    
                    setTimeout(() => {
                        copyCodeButton.removeChild(failIndicator);
                        copyIcon.style.display = originalDisplay;
                    }, 2000);
                });
            });
            
            // 添加复制按钮到容器
            buttonsContainer.appendChild(copyCodeButton);

            // 在代码块处理部分，复制按钮之后添加下载按钮
            const downloadCodeButton = document.createElement('button');
            downloadCodeButton.className = 'download-code-button';
            downloadCodeButton.title = '下载代码';

            // 使用下载SVG图标
            const downloadIcon = document.createElement('img');
            downloadIcon.src = 'image/download.svg';
            downloadIcon.alt = '下载';
            downloadCodeButton.appendChild(downloadIcon);

            downloadCodeButton.addEventListener('click', (e) => {
                e.stopPropagation();
                const codeToDownload = codeElement ? codeElement.innerText : pre.textContent;
                
                // 确定文件扩展名
                let fileExt = 'txt';
                if (codeType) {
                    switch(codeType.toLowerCase()) {
                        case 'javascript': case 'js': fileExt = 'js'; break;
                        case 'html': fileExt = 'html'; break;
                        case 'css': fileExt = 'css'; break;
                        case 'python': case 'py': fileExt = 'py'; break;
                        case 'java': fileExt = 'java'; break;
                        case 'c': fileExt = 'c'; break;
                        case 'cpp': case 'c++': fileExt = 'cpp'; break;
                        case 'json': fileExt = 'json'; break;
                        case 'xml': fileExt = 'xml'; break;
                        case 'markdown': case 'md': fileExt = 'md'; break;
                        // 其他语言可以继续添加
                    }
                }
                
                // 创建 Blob 和下载链接
                const blob = new Blob([codeToDownload], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `code.${fileExt}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                // 显示下载成功的反馈
                const originalDisplay = downloadIcon.style.display;
                downloadIcon.style.display = 'none';
                
                const successIndicator = document.createElement('span');
                successIndicator.textContent = '✓';
                successIndicator.style.color = 'var(--accent-blue-primary)';
                successIndicator.style.fontSize = '16px';
                downloadCodeButton.appendChild(successIndicator);
                
                setTimeout(() => {
                    downloadCodeButton.removeChild(successIndicator);
                    downloadIcon.style.display = originalDisplay;
                }, 2000);
            });

            // 添加按钮到容器
            buttonsContainer.appendChild(downloadCodeButton);

            // 将按钮容器添加到标题栏
            codeHeader.appendChild(buttonsContainer);
            
            // 将标题栏添加到代码块
            pre.appendChild(codeHeader);
            
            // 重新添加代码内容
            if (codeElement) {
                pre.appendChild(codeElement);
                hljs.highlightElement(codeElement);
            } else {
                const newCodeElement = document.createElement('code');
                newCodeElement.innerHTML = originalContent;
                pre.appendChild(newCodeElement);
                hljs.highlightElement(newCodeElement);
            }
        });
    } else { // User message
        messageBubble.textContent = text;
    }
    contentWrapper.appendChild(messageBubble); // Add bubble to content wrapper

    // --- Create and Add Copy Button (Below Bubble) ---
    const copyButtonWrapper = document.createElement('div');
    copyButtonWrapper.className = 'copy-message-button-wrapper';
    // Add sender-specific class for positioning
    copyButtonWrapper.classList.add(sender === 'bot' ? 'bot-copy-wrapper' : 'user-copy-wrapper');

    const copyMessageButton = document.createElement('button');
    copyMessageButton.title = '复制内容';
    copyMessageButton.className = 'copy-message-button';

    const copyImg = document.createElement('img');
    copyImg.src = 'image/copy.svg'; // Path to your copy icon
    copyImg.alt = 'Copy';
    copyMessageButton.appendChild(copyImg);

    copyMessageButton.addEventListener('click', (e) => {
        e.stopPropagation();
        // 获取消息的原始文本（从数据属性中）
        const textToCopy = messageWrapper.dataset.originalText || messageBubble.innerText;
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            // 隐藏原始图标
            const originalDisplay = copyImg.style.display;
            copyImg.style.display = 'none';
            
            // 创建成功提示（勾号）
            const successIndicator = document.createElement('span');
            successIndicator.textContent = '✓';
            successIndicator.style.color = 'var(--accent-blue-primary)';
            successIndicator.style.fontSize = '18px'; // 更大一点的勾号
            successIndicator.style.fontWeight = 'bold';
            copyMessageButton.appendChild(successIndicator);
            
            // 2秒后恢复原始状态
            setTimeout(() => {
                copyMessageButton.removeChild(successIndicator);
                copyImg.style.display = originalDisplay;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy message: ', err);
            
            // 显示失败反馈
            const originalDisplay = copyImg.style.display;
            copyImg.style.display = 'none';
            
            const failIndicator = document.createElement('span');
            failIndicator.textContent = '✗';
            failIndicator.style.color = '#ff6b6b';
            failIndicator.style.fontSize = '18px';
            copyMessageButton.appendChild(failIndicator);
            
            setTimeout(() => {
                copyMessageButton.removeChild(failIndicator);
                copyImg.style.display = originalDisplay;
            }, 2000);
        });
    });

    copyButtonWrapper.appendChild(copyMessageButton);
    contentWrapper.appendChild(copyButtonWrapper); // Add copy button wrapper below bubble

    // --- Append to DOM ---
    messageWrapper.appendChild(contentWrapper); // Add content wrapper (bubble + copy btn) to the main message wrapper
    messageList.appendChild(messageWrapper); // Add the complete message structure to the list

    // --- Save Logic (unchanged) ---
    if (save) {
        let conversationNeedsUpdate = false;
        if (!currentConversationId) {
            currentConversationId = generateId();
            console.log("Creating new chat in history with ID:", currentConversationId);
            chatHistory[currentConversationId] = {
                title: getConversationTitle([{ sender, text }]),
                messages: []
            };
            const firstBotMessage = messageList.querySelector('.message.bot .message-bubble'); // Check bubble content
            if (firstBotMessage && firstBotMessage.innerText.startsWith("你好，我是一名医疗健康领域专家")) {
                chatHistory[currentConversationId].messages.push({ sender: 'bot', text: initialWelcomeMessage });
            }
            conversationNeedsUpdate = true;
        }
        if (chatHistory[currentConversationId]) {
            const isFirstUserMessage = sender === 'user' && chatHistory[currentConversationId].messages.filter(m => m.sender === 'user').length === 0;
            if (isFirstUserMessage) {
                chatHistory[currentConversationId].title = getConversationTitle([{ sender, text }]);
                conversationNeedsUpdate = true;
            }
            chatHistory[currentConversationId].messages.push({ 
                sender, 
                text, 
                attachment: sender === 'user' && selectedFile ? {
                    name: selectedFile.name,
                    type: selectedFile.type,
                    size: selectedFile.size
                } : null
            });
            saveChatHistory(); // Make sure this is called!
            if (conversationNeedsUpdate) {
                renderHistoryList();
                updateActiveHistoryItem(currentConversationId);
            }
        } else {
            console.error("Attempted to save message but currentConversationId is invalid or chatHistory entry missing:", currentConversationId);
        }

        // Scroll immediately after adding a single message when saving
        scrollToBottom(); // Call the updated scroll function
    }
}

// 发送消息到 Coze API
async function sendMessageToCoze(message) {
    if (isWaitingForResponse) return;

    // Construct full message text including attachment info
    let messageToSend = message;
    if (selectedFile) {
        const fileDesc = getFileTypeDescription(selectedFile);
        messageToSend += `\n\n[附件: ${selectedFile.name} - ${fileDesc}]`;
        console.log("Sending message with attachment:", selectedFile.name);
    }

    isWaitingForResponse = true;
    sendButton.disabled = true;
    userInput.disabled = true;
    addMessage('user', messageToSend);
    showThinkingIndicator();

    const hadAttachment = selectedFile !== null;
    if (selectedFile) {
        removeSelectedFile();
    }

    const requestBody = {
        bot_id: botId,
        user: "user_local_demo",
        query: messageToSend,
        stream: false,
        conversation_id: conversationId || undefined
    };

    try {
        const response = await fetch(cozeApiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': '*/*',
                'Host': 'api.coze.cn',
                'Connection': 'keep-alive'
            },
            body: JSON.stringify(requestBody)
        });

        hideThinkingIndicator();

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ msg: '无法解析错误信息' }));
            console.error("API Error Response:", errorData);
            throw new Error(`API 请求失败，状态码：${response.status}. 信息: ${errorData.msg || '未知错误'}`);
        }

        const data = await response.json();
        console.log("API Success Response:", data);

        if (data.code === 0 && data.msg === 'success') {
            conversationId = data.conversation_id;

            const answerMessage = data.messages.find(msg => msg.type === 'answer');

            if (answerMessage) {
                addMessage('bot', answerMessage.content);
            } else {
                const otherMessageContent = data.messages.length > 0 ? data.messages[data.messages.length - 1].content : "未能获取有效回复";
                addMessage('bot', otherMessageContent);
                console.warn("未找到 'answer' 类型的消息，显示最后一条消息:", data.messages);
            }
        } else {
            throw new Error(`API 返回错误：Code: ${data.code}, Msg: ${data.msg}`);
        }

    } catch (error) {
        console.error('发送消息时出错:', error);
        hideThinkingIndicator();
        addMessage('error', `发生错误: ${error.message}`);
    } finally {
        isWaitingForResponse = false;
        sendButton.disabled = false;
        userInput.disabled = false;
        userInput.focus();
    }
}

// Function to show the thinking indicator
function showThinkingIndicator() {
    if (thinkingIndicatorElement) return;
    thinkingIndicatorElement = document.createElement('div');
    thinkingIndicatorElement.className = 'thinking-indicator';
    
    // 添加动态圆点指示
    const dotsContainer = document.createElement('div');
    dotsContainer.className = 'thinking-dots';
    dotsContainer.innerHTML = '<span></span><span></span><span></span>';
    
    // 添加美化后的等待提示文字
    const waitText = document.createElement('div');
    waitText.className = 'waiting-text';
    
    // 使用stethoscope.svg替代不存在的clock.svg
    const waitingIcon = document.createElement('img');
    waitingIcon.src = 'image/rotate-cw.svg'; // 使用医疗相关的图标，更符合医疗健康主题
    waitingIcon.alt = '等待';
    
    // 组合图标和文字
    waitText.appendChild(waitingIcon);
    waitText.appendChild(document.createTextNode('Agent回复较慢请在本页面耐心等待'));
    
    // 将两个元素添加到指示器中
    thinkingIndicatorElement.appendChild(dotsContainer);
    thinkingIndicatorElement.appendChild(waitText);
    
    messageList.appendChild(thinkingIndicatorElement); // Append to the end
    // Scroll immediately after adding indicator
    scrollToBottom(); // Call the updated scroll function
}

// Function to hide the thinking indicator
function hideThinkingIndicator() {
    if (thinkingIndicatorElement) {
        messageList.removeChild(thinkingIndicatorElement);
        thinkingIndicatorElement = null;
    }
}

// 添加在HTML代码块旁边显示预览按钮并处理预览功能
function setupHtmlPreview(messageBubble) {
    // 查找所有包含HTML代码的代码块
    const preElements = messageBubble.querySelectorAll('pre');
    preElements.forEach(pre => {
        const codeElement = pre.querySelector('code');
        // 检查是否是HTML代码块
        if (codeElement && (codeElement.className.includes('language-html') || 
            codeElement.className.includes('lang-html') || 
            codeElement.className.includes('html'))) {
            
            // 确保按钮只添加一次，检查按钮是否已存在于正确的容器中
            const buttonsContainer = pre.querySelector('.code-header .code-buttons-container');
            if (buttonsContainer && buttonsContainer.querySelector('.preview-html-button')) {
                return; // 如果按钮已存在，则不重复添加
            }
            // 如果是在旧的直接添加到pre的逻辑下，也检查一下
            if (!buttonsContainer && pre.querySelector('.preview-html-button')) {
                return;
            }

            const previewButton = document.createElement('button');
            previewButton.className = 'preview-html-button';
            previewButton.title = '预览HTML';
            
            const eyeIcon = document.createElement('img');
            eyeIcon.src = 'image/eye.svg';
            eyeIcon.alt = '预览';
            previewButton.appendChild(eyeIcon);
            
            // 将按钮添加到代码块的标题栏的按钮容器中
            if (buttonsContainer) {
                buttonsContainer.appendChild(previewButton);
            } else {
                pre.appendChild(previewButton); // Original logic from user's version
            }
            
            previewButton.addEventListener('click', (e) => {
                e.stopPropagation();
                
                const rawHtmlCode = codeElement.innerText;
                
                const previewOverlay = document.createElement('div');
                previewOverlay.className = 'html-preview-overlay';
                const previewContainer = document.createElement('div');
                previewContainer.className = 'html-preview-container';
                const titleBar = document.createElement('div');
                titleBar.className = 'html-preview-title';
                titleBar.innerHTML = '<span>HTML 预览</span>';
                const closeButton = document.createElement('button');
                closeButton.className = 'html-preview-close';
                closeButton.innerHTML = '&times;';
                closeButton.title = '关闭预览';
                titleBar.appendChild(closeButton);
                
                const previewFrame = document.createElement('iframe');
                previewFrame.className = 'html-preview-frame';
                previewFrame.sandbox = 'allow-scripts allow-same-origin'; // Crucial for ECharts and other scripts
                
                previewContainer.appendChild(titleBar);
                previewContainer.appendChild(previewFrame);
                previewOverlay.appendChild(previewContainer);
                document.body.appendChild(previewOverlay);
                
                const frameDoc = previewFrame.contentDocument || previewFrame.contentWindow.document;

                let htmlToLoad = rawHtmlCode;
                const scriptsToExecute = [];

                // Detect ECharts and if ECharts library is missing
                const isEcharts = htmlToLoad.includes('echarts.init') || htmlToLoad.includes('echarts.');
                const hasEchartsLib = htmlToLoad.includes('echarts.min.js') || htmlToLoad.includes('echarts.js');

                // Separate script tags from the main HTML content
                const scriptTagRegex = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
                htmlToLoad = htmlToLoad.replace(scriptTagRegex, (match) => {
                    scriptsToExecute.push(match);
                    return '<!-- script placeholder -->'; // Replace script with a placeholder
                });
                
                frameDoc.open();
                frameDoc.write('<!DOCTYPE html><html><head><meta charset="UTF-8">');
                // Inject ECharts library if it's an ECharts snippet and the library is not already included
                if (isEcharts && !hasEchartsLib) {
                    frameDoc.write('<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"><\/script>');
                }
                frameDoc.write('</head><body>');
                frameDoc.write(htmlToLoad); // Write the HTML content (without original scripts)
                frameDoc.write('</body></html>');
                frameDoc.close();

                // Execute the collected scripts after the iframe's main content has been loaded and parsed
                previewFrame.onload = () => {
                    scriptsToExecute.forEach(scriptContent => {
                        const scriptElement = frameDoc.createElement('script');
                        const srcMatch = scriptContent.match(/src=['\"]([^\'\"]+)['\"]/i);
                        if (srcMatch && srcMatch[1]) {
                            scriptElement.src = srcMatch[1];
                        } else {
                            const inlineScriptMatch = scriptContent.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
                            if (inlineScriptMatch && inlineScriptMatch[1]) {
                                scriptElement.textContent = inlineScriptMatch[1];
                            }
                        }
                        frameDoc.body.appendChild(scriptElement); 
                    });
                };
                
                closeButton.addEventListener('click', () => {
                    document.body.removeChild(previewOverlay);
                });
                previewOverlay.addEventListener('click', (ev) => {
                    if (ev.target === previewOverlay) {
                        document.body.removeChild(previewOverlay);
                    }
                });
                const handleEsc = (ev) => {
                    if (ev.key === 'Escape') {
                        document.body.removeChild(previewOverlay);
                        document.removeEventListener('keydown', handleEsc);
                    }
                };
                document.addEventListener('keydown', handleEsc);
            });
        }
    });
}

// --- 图片预览功能实现 ---
function setupImagePreview() {
    // 给消息区域内所有图片添加点击事件
    messageList.addEventListener('click', (e) => {
        // 检查点击的是否为图片元素
        if (e.target.tagName === 'IMG' && e.target.closest('.message-bubble')) {
            // 打开图片预览
            openImagePreview(e.target.src);
        }
    });

    // 关闭预览按钮事件
    closePreviewBtn.addEventListener('click', closeImagePreview);

    // 缩放功能
    zoomInBtn.addEventListener('click', () => {
        if (currentScale < 3) { // 限制最大放大倍数
            currentScale += 0.25;
            updateImageTransform();
        }
    });

    zoomOutBtn.addEventListener('click', () => {
        if (currentScale > 0.5) { // 限制最小缩小倍数
            currentScale -= 0.25;
            updateImageTransform();
        }
    });

    // 旋转功能
    rotateLeftBtn.addEventListener('click', () => {
        currentRotation -= 90;
        updateImageTransform();
    });

    rotateRightBtn.addEventListener('click', () => {
        currentRotation += 90;
        updateImageTransform();
    });

    // 下载按钮功能
    downloadBtn.addEventListener('click', (e) => {
        if (previewImage.src) {
            downloadBtn.href = previewImage.src;
            let fileName = previewImage.src.split('/').pop();
            downloadBtn.download = fileName || 'image.jpg';
        } else {
            e.preventDefault();
        }
    });

    // 支持键盘操作
    document.addEventListener('keydown', (e) => {
        if (!previewModal.classList.contains('active')) return;

        switch (e.key) {
            case 'Escape':
                closeImagePreview();
                break;
            case '+':
            case '=':
                if (currentScale < 3) {
                    currentScale += 0.25;
                    updateImageTransform();
                }
                break;
            case '-':
                if (currentScale > 0.5) {
                    currentScale -= 0.25;
                    updateImageTransform();
                }
                break;
            case 'ArrowLeft':
                if (e.ctrlKey) {
                    currentRotation -= 90;
                    updateImageTransform();
                }
                break;
            case 'ArrowRight':
                if (e.ctrlKey) {
                    currentRotation += 90;
                    updateImageTransform();
                }
                break;
        }
    });

    // 支持拖拽移动图片
    previewImage.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX - translateX;
        startY = e.clientY - translateY;
        previewImage.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        translateX = e.clientX - startX;
        translateY = e.clientY - startY;
        updateImageTransform();
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        previewImage.style.cursor = 'move';
    });

    // 双击重置缩放和位置
    previewImage.addEventListener('dblclick', () => {
        currentScale = 1;
        currentRotation = 0;
        translateX = 0;
        translateY = 0;
        updateImageTransform();
    });

    // 支持鼠标滚轮缩放
    previewImage.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.deltaY < 0 && currentScale < 3) {
            currentScale += 0.1;
        } else if (e.deltaY > 0 && currentScale > 0.5) {
            currentScale -= 0.1;
        }
        updateImageTransform();
    });

    // 点击模态框背景关闭预览
    previewModal.addEventListener('click', (e) => {
        if (e.target === previewModal) {
            closeImagePreview();
        }
    });

    // 为触摸设备添加支持
    previewImage.addEventListener('touchstart', (e) => {
        isDragging = true;
        const touch = e.touches[0];
        startX = touch.clientX - translateX;
        startY = touch.clientY - translateY;
        e.preventDefault();
    });

    document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const touch = e.touches[0];
        translateX = touch.clientX - startX;
        translateY = touch.clientY - startY;
        updateImageTransform();
        e.preventDefault();
    });

    document.addEventListener('touchend', () => {
        isDragging = false;
    });
    
    // 添加双指缩放支持
    let initialDistance = 0;
    
    previewImage.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            initialDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
        }
    });
    
    previewImage.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            const currentDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            
            if (initialDistance > 0) {
                const scale = currentDistance / initialDistance;
                
                if (scale > 1 && currentScale < 3) {
                    currentScale += 0.02;
                    updateImageTransform();
                } else if (scale < 1 && currentScale > 0.5) {
                    currentScale -= 0.02;
                    updateImageTransform();
                }
            }
            e.preventDefault();
        }
    });
}

// --- 图片预览相关函数 ---
function openImagePreview(src) {
    // 重置变换参数
    currentScale = 1;
    currentRotation = 0;
    translateX = 0;
    translateY = 0;
    
    // 设置图片源
    previewImage.src = src;
    
    // 显示模态框
    previewModal.classList.add('active');
    
    // 防止页面滚动
    document.body.style.overflow = 'hidden';
    
    // 更新下载按钮
    downloadBtn.href = src;
    let fileName = src.split('/').pop();
    downloadBtn.download = fileName || 'image.jpg';
}

function closeImagePreview() {
    previewModal.classList.remove('active');
    document.body.style.overflow = '';
}

function updateImageTransform() {
    previewImage.style.transform = `translate(${translateX}px, ${translateY}px) rotate(${currentRotation}deg) scale(${currentScale})`;
}

// Helper functions
function generateId() {
    return `conv_${Date.now()}`;
}

function getConversationTitle(messages) {
    const firstUserMessage = messages.find(msg => msg.sender === 'user');
    return firstUserMessage ? firstUserMessage.text.slice(0, 20) : "Chat";
}

// --- Auto-resize Textarea ---
function autoResizeTextarea() {
    userInput.style.height = 'auto'; // Reset height
    userInput.style.height = userInput.scrollHeight + 'px'; // Set to scroll height
}

// --- Attachment Handling ---
function updateAttachmentPreview() {
    if (!attachmentPreview) return;
    
    attachmentPreview.innerHTML = ''; // 清除之前的预览
    
    if (selectedFile) {
        // 创建一个显示文件信息的容器
        const attachmentItem = document.createElement('div');
        attachmentItem.className = 'attachment-item';
        
        // 使用paperclip.svg替代Emoji
        const fileIcon = document.createElement('img');
        fileIcon.src = 'image/paperclip.svg';
        fileIcon.alt = '附件';
        attachmentItem.appendChild(fileIcon);
        
        // 文件名显示
        const fileNameSpan = document.createElement('span');
        fileNameSpan.textContent = selectedFile.name;
        fileNameSpan.title = selectedFile.name;
        attachmentItem.appendChild(fileNameSpan);
        
        // 创建删除按钮
        const removeButton = document.createElement('button');
        removeButton.innerHTML = '&times;'; // × 符号
        removeButton.className = 'remove-attachment-button';
        removeButton.title = '移除附件';
        removeButton.onclick = removeSelectedFile;
        
        attachmentItem.appendChild(removeButton);
        attachmentPreview.appendChild(attachmentItem);
    }
}

function removeSelectedFile() {
    selectedFile = null;
    fileInput.value = ''; // Clear file input
    updateAttachmentPreview(); // Update UI
}

function getFileTypeDescription(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    const sizeInKB = Math.round(file.size / 1024);
    
    let typeDesc = '';
    
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension)) {
        typeDesc = '图片';
    } else if (['doc', 'docx'].includes(extension)) {
        typeDesc = 'Word 文档';
    } else if (extension === 'pdf') {
        typeDesc = 'PDF 文件';
    } else if (['txt', 'md'].includes(extension)) {
        typeDesc = '文本文件';
    } else {
        typeDesc = '文件';
    }
    
    return `${typeDesc} (${sizeInKB}KB)`;
}

// --- 提示词卡片功能 ---
function setupPromptCards() {
    const promptButtons = document.querySelectorAll('.use-prompt-btn');
    const copyButtons = document.querySelectorAll('.copy-prompt-btn');
    
    // 使用提示词按钮功能
    promptButtons.forEach(button => {
        button.addEventListener('click', () => {
            const promptText = button.getAttribute('data-prompt');
            if (promptText) {
                // 创建新对话
                startNewConversation(true);
                
                // 填入提示词到输入框
                userInput.value = promptText;
                
                // 自动调整输入框高度
                autoResizeTextarea();
                
                // 聚焦输入框，方便用户直接发送或修改
                setTimeout(() => {
                    userInput.focus();
                    // 将光标放到文本末尾
                    userInput.setSelectionRange(promptText.length, promptText.length);
                }, 100);
            }
        });
    });

    // 复制提示词按钮功能
    copyButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            // 获取当前卡片的内容
            const card = button.closest('.prompt-card');
            const promptText = card.querySelector('.prompt-card-content p').textContent;
            
            // 复制到剪贴板
            navigator.clipboard.writeText(promptText).then(() => {
                // 显示复制成功的反馈
                const originalImg = button.querySelector('img');
                const originalDisplay = originalImg.style.display;
                
                // 隐藏原始图标
                originalImg.style.display = 'none';
                
                // 创建成功提示
                const successIndicator = document.createElement('span');
                successIndicator.textContent = '✓';
                successIndicator.style.color = 'var(--accent-blue-primary)';
                successIndicator.style.fontSize = '16px';
                button.appendChild(successIndicator);
                
                // 2秒后恢复原始状态
                setTimeout(() => {
                    button.removeChild(successIndicator);
                    originalImg.style.display = originalDisplay;
                }, 2000);
            }).catch(err => {
                console.error('复制提示词失败:', err);
                
                // 显示失败反馈
                const originalImg = button.querySelector('img');
                const originalDisplay = originalImg.style.display;
                
                originalImg.style.display = 'none';
                
                const failIndicator = document.createElement('span');
                failIndicator.textContent = '✗';
                failIndicator.style.color = '#ff6b6b';
                failIndicator.style.fontSize = '16px';
                button.appendChild(failIndicator);
                
                setTimeout(() => {
                    button.removeChild(failIndicator);
                    originalImg.style.display = originalDisplay;
                }, 2000);
            });
        });
    });
}

// --- 导航模块切换逻辑 ---
function switchSection(sectionId) {
    // 隐藏所有部分
    sectionChat.style.display = 'none';
    sectionIntro.style.display = 'none';
    sectionPrompts.style.display = 'none';
    
    // 移除所有导航项的活动状态
    navItems.forEach(item => {
        item.classList.remove('active');
    });
    
    // 显示选定的部分
    if (sectionId === 'chat') {
        sectionChat.style.display = 'block';
        document.querySelector('.nav-item[data-section="chat"]').classList.add('active');
    } else if (sectionId === 'intro') {
        sectionIntro.style.display = 'block';
        document.querySelector('.nav-item[data-section="intro"]').classList.add('active');
        // 在切换到非聊天界面时，移除历史记录项的高亮状态
        updateActiveHistoryItem(null);
    } else if (sectionId === 'prompts') {
        sectionPrompts.style.display = 'block';
        document.querySelector('.nav-item[data-section="prompts"]').classList.add('active');
        // 在切换到非聊天界面时，移除历史记录项的高亮状态
        updateActiveHistoryItem(null);
    }
    
    currentSection = sectionId;
    
    // 如果切换到聊天部分，聚焦输入框
    if (sectionId === 'chat') {
        setTimeout(() => {
            userInput.focus();
        }, 100);
        
        // 如果有当前选中的对话，恢复其高亮状态
        if (currentConversationId) {
            updateActiveHistoryItem(currentConversationId);
        }
    }
    
    // 保存当前部分到本地存储
    localStorage.setItem('currentSection', sectionId);
}

// --- 导航功能 ---
function setupNavigation() {
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetSection = item.getAttribute('data-section');
            
            // 如果点击的是聊天项，创建新对话而不是切换到现有对话
            if (targetSection === 'chat') {
                startNewConversation(true);
                return;
            }
            
            // 为其他导航项正常切换section
            switchSection(targetSection);
            
            // 更新激活状态
            navItems.forEach(navItem => {
                navItem.classList.remove('active');
            });
            item.classList.add('active');
        });
    });
}

// 添加 anime.js 动画效果
function initAnimeEffects() {
    // 导航项的悬停动画
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('mouseenter', () => {
            anime({
                targets: item.querySelector('.nav-icon'),
                rotate: '15deg',
                scale: 1.1,
                duration: 300,
                easing: 'easeOutElastic(1, .6)'
            });
        });
        
        item.addEventListener('mouseleave', () => {
            anime({
                targets: item.querySelector('.nav-icon'),
                rotate: '0deg',
                scale: 1,
                duration: 400,
                easing: 'easeOutElastic(1, .6)'
            });
        });
    });

    // 消息气泡入场动画
    function animateMessages() {
        const messages = document.querySelectorAll('.message');
        anime({
            targets: messages,
            opacity: [0, 1],
            translateY: [20, 0],
            easing: 'easeOutExpo',
            duration: 600,
            delay: anime.stagger(150)
        });
    }
    animateMessages(); // 运行一次初始动画
    
    // 消息发送后的动画效果
    const originalAddMessage = addMessage;
    addMessage = function(sender, text, save = true) {
        originalAddMessage(sender, text, save);
        const lastMessage = messageList.lastElementChild;
        if (lastMessage) {
            anime({
                targets: lastMessage,
                opacity: [0, 1],
                translateY: [20, 0],
                easing: 'easeOutExpo',
                duration: 600
            });
        }
    };
    
    // Agent卡片的悬停动画
    const agentCards = document.querySelectorAll('.agent-card, .prompt-card');
    agentCards.forEach(card => {
        card.addEventListener('mouseenter', () => {
            anime({
                targets: card,
                translateY: [0, -5],
                boxShadow: ['0 2px 8px rgba(10, 77, 163, 0.15)', '0 8px 20px rgba(10, 77, 163, 0.15)'],
                duration: 500,
                easing: 'easeOutElastic(1, .6)'
            });
            
            // 图标动画
            const icon = card.querySelector('.agent-icon, .agent-intro-icon');
            if (icon) {
                anime({
                    targets: icon,
                    rotate: '15deg',
                    scale: 1.2,
                    duration: 500,
                    easing: 'easeOutElastic(1, .6)'
                });
            }
        });
        
        card.addEventListener('mouseleave', () => {
            anime({
                targets: card,
                translateY: [-5, 0],
                boxShadow: ['0 8px 20px rgba(10, 77, 163, 0.15)', '0 2px 8px rgba(10, 77, 163, 0.15)'],
                duration: 600,
                easing: 'easeOutElastic(1, .6)'
            });
            
            // 图标恢复
            const icon = card.querySelector('.agent-icon, .agent-intro-icon');
            if (icon) {
                anime({
                    targets: icon,
                    rotate: '0deg',
                    scale: 1,
                    duration: 600,
                    easing: 'easeOutElastic(1, .6)'
                });
            }
        });
    });
    
    // 水波纹点击效果
    const clickableElements = document.querySelectorAll(
        '.nav-item, button, .agent-card, .prompt-card, .use-prompt-btn, .copy-prompt-btn'
    );
    clickableElements.forEach(el => {
        el.addEventListener('click', (e) => {
            const rect = el.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const ripple = document.createElement('div');
            ripple.className = 'ripple-effect';
            ripple.style.left = `${x}px`;
            ripple.style.top = `${y}px`;
            
            el.appendChild(ripple);
            
            setTimeout(() => {
                ripple.remove();
            }, 600);
        });
    });
    
    // Logo 浮动动画
    const logo = document.querySelector('.intro-logo');
    if (logo) {
        anime({
            targets: logo,
            translateY: [0, -5],
            rotate: [0, 2],
            loop: true,
            direction: 'alternate',
            easing: 'easeInOutQuad',
            duration: 3000
        });
    }
    
    // 思考指示器动画增强
    const originalShowThinkingIndicator = showThinkingIndicator;
    showThinkingIndicator = function() {
        originalShowThinkingIndicator();
        if (thinkingIndicatorElement) {
            const dots = thinkingIndicatorElement.querySelectorAll('span');
            anime({
                targets: dots,
                scale: [0, 1],
                opacity: [0, 1],
                delay: anime.stagger(120),
                loop: true,
                direction: 'alternate',
                easing: 'easeInOutQuad',
                duration: 700
            });
        }
    };
    
    // 发送按钮和附件按钮动画
    const actionButtons = document.querySelectorAll('.input-action-button');
    actionButtons.forEach(button => {
        button.addEventListener('mouseenter', () => {
            anime({
                targets: button,
                translateY: [0, -2],
                duration: 300,
                easing: 'easeOutElastic(1, .6)'
            });
            
            anime({
                targets: button.querySelector('img'),
                scale: 1.1,
                duration: 300,
                easing: 'easeOutElastic(1, .6)'
            });
        });
        
        button.addEventListener('mouseleave', () => {
            anime({
                targets: button,
                translateY: [-2, 0],
                duration: 400,
                easing: 'easeOutElastic(1, .6)'
            });
            
            anime({
                targets: button.querySelector('img'),
                scale: 1,
                duration: 400,
                easing: 'easeOutElastic(1, .6)'
            });
        });
    });
    
    // 新对话按钮发光效果
    const newChatButton = document.getElementById('new-chat-button');
    if (newChatButton) {
        anime({
            targets: newChatButton,
            boxShadow: [
                '0 4px 12px rgba(74, 148, 241, 0.2)',
                '0 4px 12px rgba(74, 148, 241, 0.5)',
                '0 4px 12px rgba(74, 148, 241, 0.2)'
            ],
            duration: 2000,
            loop: true,
            easing: 'easeInOutQuad'
        });
    }
}

// --- 水波纹动画功能 ---
function createRipple(x, y) {
    const rippleContainer = document.querySelector('.water-ripple-container');
    if (!rippleContainer) return;
    
    // 使用池中现有的水波纹元素或创建新元素
    let ripple = rippleContainer.querySelector('.water-ripple:not(.active)');
    if (!ripple) {
        ripple = document.createElement('div');
        ripple.className = 'water-ripple';
        rippleContainer.appendChild(ripple);
    }
    
    // 设置波纹位置和基本样式
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    ripple.style.width = '0';
    ripple.style.height = '0';
    ripple.style.opacity = '0.8';
    
    // 标记为活跃状态
    ripple.classList.add('active');
    
    // 创建随机大小的波纹
    const size = Math.random() * 200 + 100; // 100-300px 范围内的随机大小
    
    // 使用anime.js设置动画
    anime({
        targets: ripple,
        width: size,
        height: size,
        left: x - size/2,
        top: y - size/2,
        opacity: 0,
        easing: 'easeOutQuad',
        duration: 3000, // 更长的持续时间，使水波纹效果更加舒缓
        complete: function() {
            // 动画完成后重置并标记为非活跃
            ripple.classList.remove('active');
        }
    });
}

// 在初始化动画效果中添加水波纹触发
function setupWaterRippleEffects() {
    document.addEventListener('click', (e) => {
        // 只在页面主要区域产生波纹，不包括侧边栏
        if (!e.target.closest('.sidebar')) {
            createRipple(e.clientX, e.clientY);
        }
    });
    
    // 创建随机的水波纹效果
    function createRandomRipple() {
        if (Math.random() > 0.7) { // 30%的几率创建随机波纹
            const width = window.innerWidth;
            const height = window.innerHeight;
            
            // 避开侧边栏区域
            const x = Math.random() * (width - 300) + 300; // 侧边栏宽度约为300px
            const y = Math.random() * height;
            
            createRipple(x, y);
        }
        
        // 每2-7秒随机调用一次
        const timeout = Math.random() * 5000 + 2000;
        setTimeout(createRandomRipple, timeout);
    }
    
    // 启动随机波纹生成
    createRandomRipple();
    
    // 输入和互动时也产生波纹效果
    userInput.addEventListener('focus', () => {
        const rect = userInput.getBoundingClientRect();
        createRipple(rect.left + rect.width / 2, rect.top);
    });
    
    // 当切换导航项时产生水波纹
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const rect = item.getBoundingClientRect();
            setTimeout(() => {
                createRipple(rect.right + 50, rect.top + rect.height / 2);
            }, 100);
        });
    });
}

// 添加水波纹效果的CSS
function addRippleStyle() {
    const style = document.createElement('style');
    style.textContent = `
        .ripple-effect {
            position: absolute;
            background: radial-gradient(circle, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 70%);
            border-radius: 50%;
            pointer-events: none;
            transform: scale(0);
            animation: ripple 0.6s ease-out;
            z-index: 0;
        }
        
        @keyframes ripple {
            to {
                transform: scale(2);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}

// 处理发送按钮点击事件
sendButton.addEventListener('click', () => {
    const message = userInput.value.trim();
    if (message) {
        sendMessageToCoze(message);
        userInput.value = '';
    }
});

// 处理在输入框按 Enter 键
userInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendButton.click();
    }
    // Allow Shift+Enter to create a newline (default textarea behavior)
});

if (newChatButton) {
    newChatButton.addEventListener('click', () => startNewConversation(true));
    console.log("New chat button listener attached.");
} else {
    console.error("New chat button not found!");
}

// Add listener for textarea input to resize
userInput.addEventListener('input', autoResizeTextarea);

// Modified Attachment Button Listener
attachmentButton.addEventListener('click', () => {
    fileInput.click(); // Trigger the hidden file input
});

// Add listener for file input changes
fileInput.addEventListener('change', (event) => {
    const files = event.target.files;
    if (files.length > 0) {
        selectedFile = files[0];
        console.log("Selected file:", selectedFile);
        updateAttachmentPreview(); // Update preview UI
    } else {
        if (selectedFile) {
            selectedFile = null;
            updateAttachmentPreview();
        }
    }
});

// 初始欢迎消息
const initialWelcomeMessage = `你好，我是一名医疗健康领域专家，我由多 Agents 架构构成，具有以下能力：
1.  进行线上看病服务。
2.  为你科普医疗健康领域的相关知识。
3.  通过现实数据为你撰写医学健康领域报告。
4.  为你设计运动，饮食等健康方面的计划。

此外，我还具有帮你优化提示词的功能。`;

// Initial setup on page load
function initializeApp() {
    userInput.focus();
    loadChatHistory(); // This is crucial for persistence
    autoResizeTextarea();
    
    // 从本地存储加载上次访问的部分
    const lastSection = localStorage.getItem('currentSection') || 'chat';
    switchSection(lastSection);
    
    // 设置提示词卡片功能
    setupPromptCards();
    
    // 设置导航功能
    setupNavigation();
    
    // 添加水波纹样式
    addRippleStyle();
    
    // 初始化图片预览功能
    setupImagePreview();
    
    // 初始化动画效果
    initAnimeEffects();
    
    // 初始化水波纹效果
    setupWaterRippleEffects();
    
    console.log("App initialized with image preview capability.");
}

// Run initialization when the DOM is ready
initializeApp();