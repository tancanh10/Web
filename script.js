// ================= CẤU HÌNH, KHÓA LƯU TRỮ VÀ TRẠNG THÁI ỨNG DỤNG =================
const STORAGE_KEY_INV = 'electronics_inventory_data_v2';
const STORAGE_KEY_BOM = 'electronics_bom_products_v2';
const STORAGE_KEY_PROC = 'electronics_procurement_list_v2';
const STORAGE_KEY_LOGS = 'electronics_history_logs_v2';
const STORAGE_KEY_TX_RECEIPTS = 'electronics_transaction_receipts_v1';
const STORAGE_KEY_WORKSPACE_PROJECTS = 'workspace_projects_v1';
const STORAGE_KEY_WORKSPACE_PLANS = 'workspace_plans_v1';
const STORAGE_KEY_APP_LANGUAGE = 'naphutech_app_language_v1';
const STORAGE_KEY_GUIDE_STEPS = 'naphutech_guide_steps_v1';
const STORAGE_KEY_APP_THEME = 'naphutech_app_theme_v1';
const STORAGE_KEY_NOTIFICATION_LOW_STOCK = 'naphutech_notification_low_stock_v1';
const STORAGE_KEY_NOTIFICATION_SCHEDULE = 'naphutech_notification_schedule_v1';
const STORAGE_KEY_GUIDE_CONTENT = 'naphutech_guide_content_v1';
const STORAGE_KEY_SHARED_TODOS = 'naphutech_shared_todos_v1';
const STORAGE_KEY_SHARED_NOTES = 'naphutech_shared_notes_v1';
const STORAGE_KEY_WORKSPACE_MEMBERS = 'naphutech_workspace_members_v1';
const SHARED_WORKSPACE_STORAGE_KEYS = [
    STORAGE_KEY_INV,
    STORAGE_KEY_BOM,
    STORAGE_KEY_PROC,
    STORAGE_KEY_LOGS,
    STORAGE_KEY_TX_RECEIPTS,
    STORAGE_KEY_WORKSPACE_PROJECTS,
    STORAGE_KEY_WORKSPACE_PLANS,
    STORAGE_KEY_GUIDE_STEPS,
    STORAGE_KEY_GUIDE_CONTENT,
    STORAGE_KEY_SHARED_TODOS,
    STORAGE_KEY_SHARED_NOTES,
    STORAGE_KEY_WORKSPACE_MEMBERS
];
let supabaseClient = null;
let currentAuthUser = null;
let workspaceSyncEnabled = false;
let workspaceSyncTimer = null;
let workspaceSyncQueue = Promise.resolve();
let workspaceRealtimeChannel = null;
let authActivationPromise = null;
let authActivationUserId = '';
const pendingWorkspaceStorageKeys = new Set();
let appInitialized = false;
const INVENTORY_PAGE_SIZE = 5;
const MATERIAL_CATEGORY_VALUES = ['other', 'passive', 'sensor', 'board', 'chip', 'tool'];
let inventoryCurrentPage = 1;
let inventoryPageCount = 1;
let inventoryFilterKey = '';
let pendingInventoryImport = [];
let inventoryImportLookupId = 0;
let inventoryImportImageLookupController = null;
let dashboardChartPeriod = 'daily';
let appLanguage = localStorage.getItem(STORAGE_KEY_APP_LANGUAGE) === 'en' ? 'en' : 'vi';
let appTheme = localStorage.getItem(STORAGE_KEY_APP_THEME) === 'light' ? 'light' : 'dark';
const notificationPreferences = {
    lowStock: localStorage.getItem(STORAGE_KEY_NOTIFICATION_LOW_STOCK) !== 'false',
    schedule: localStorage.getItem(STORAGE_KEY_NOTIFICATION_SCHEDULE) !== 'false'
};
let workspaceProjects = JSON.parse(localStorage.getItem(STORAGE_KEY_WORKSPACE_PROJECTS)) || [];
let workspacePlans = JSON.parse(localStorage.getItem(STORAGE_KEY_WORKSPACE_PLANS)) || [];
let workspacePlanDate = '';
let workspacePlanProjectIds = [];
let workspaceProjectSearchTerm = '';
let workspaceProgressPlanId = '';
let workspaceProgressMode = 'add';
let workspaceDashboardDate = '';
let transactionReceipts = JSON.parse(localStorage.getItem(STORAGE_KEY_TX_RECEIPTS)) || [];
let activeUserName = '';
let sharedGuideContent = [];
let sharedTodos = [];
let sharedNotes = [];
let workspaceMembers = normalizeWorkspaceMemberNames(JSON.parse(localStorage.getItem(STORAGE_KEY_WORKSPACE_MEMBERS)) || []);
let todoSelectedAssignees = new Set();
let activeTodoAssigneeEditor = null;
let todoAssigneeDraft = new Set();
let activeTodoFilter = 'all';
const defaultGuideSteps = [
    { id: 'define-scope', vi: 'Xác định mục tiêu, phạm vi và yêu cầu sản phẩm', en: 'Define project goals, scope, and product requirements' },
    { id: 'create-project', vi: 'Tạo dự án và phân chia các công việc cần thực hiện', en: 'Create a project and break down the work' },
    { id: 'configure-bom', vi: 'Thiết lập sản phẩm và định mức linh kiện BOM', en: 'Configure the product and its bill of materials' },
    { id: 'check-inventory', vi: 'Kiểm tra tồn kho và lên danh sách vật tư cần mua', en: 'Check inventory and prepare a replenishment list' },
    { id: 'schedule-work', vi: 'Lên lịch công việc, thời hạn và mức độ ưu tiên', en: 'Schedule tasks, deadlines, and priorities' },
    { id: 'build-and-track', vi: 'Thực hiện, cập nhật tiến độ và ghi nhận xuất / nhập kho', en: 'Build, update progress, and record stock movements' },
    { id: 'verify-and-close', vi: 'Kiểm tra chất lượng, nghiệm thu và hoàn tất dự án', en: 'Verify quality, sign off, and complete the project' }
];
let guideSteps = JSON.parse(localStorage.getItem(STORAGE_KEY_GUIDE_STEPS)) ||
    defaultGuideSteps.map(step => ({ ...step, done: false, custom: false }));

// ================= TỪ ĐIỂN GIAO DIỆN SONG NGỮ =================
const UI_TRANSLATIONS = {
    settings: ['Cài đặt', 'Settings'], settingsEyebrow: ['TÙY CHỈNH KHÔNG GIAN LÀM VIỆC', 'WORKSPACE PREFERENCES'],
    settingsTitle: ['Cài đặt', 'Settings'],
    settingsDescription: ['Tùy chỉnh giao diện và chọn những cập nhật bạn muốn nhận.', 'Personalize the appearance and choose which updates you want to receive.'],
    appearanceSettings: ['Giao diện', 'Appearance'], appearanceSettingsSubtitle: ['Chọn chế độ hiển thị phù hợp với môi trường làm việc.', 'Choose the display mode that suits your workspace.'],
    darkMode: ['Chế độ tối', 'Dark mode'], darkModeDescription: ['Giao diện dịu mắt với nền xanh than và điểm nhấn xanh lam.', 'A comfortable navy interface with balanced blue accents.'],
    lightMode: ['Chế độ sáng', 'Light mode'], lightModeDescription: ['Giao diện sáng, rõ ràng cho môi trường nhiều ánh sáng.', 'A bright, clear interface for well-lit environments.'],
    notificationSettings: ['Thông báo', 'Notifications'], notificationSettingsSubtitle: ['Chọn nhóm cập nhật sẽ xuất hiện trong bảng thông báo.', 'Choose which updates appear in the notification panel.'],
    lowStockNotifications: ['Vật tư cần bổ sung', 'Low-stock materials'],
    lowStockNotificationsDescription: ['Báo vật tư hết hàng hoặc cần nhập thêm theo danh sách mua.', 'Alert when materials are out of stock or need replenishment.'],
    scheduleNotifications: ['Lịch trình hôm nay', "Today's schedule"],
    scheduleNotificationsDescription: ['Báo các công việc đã được lên lịch trong ngày hôm nay.', 'Alert about work scheduled for today.'],
    settingSaved: ['Đã lưu cài đặt.', 'Settings saved.'],
    language: ['Ngôn ngữ', 'Language'], mainMenu: ['Menu chính', 'MAIN MENU'],
    overview: ['Tổng quan', 'Overview'], insights: ['Phân tích & hỗ trợ', 'INSIGHTS & SUPPORT'],
    reports: ['Báo cáo thống kê', 'Analytics reports'], workGuide: ['Hướng dẫn công việc', 'Work guide'],
    workDashboard: ['Công việc', 'Work dashboard'], operationsOverview: ['TỔNG QUAN VẬN HÀNH', 'OPERATIONS OVERVIEW'],
    welcomeBack: ['Chào mừng trở lại', 'Welcome back'], materialTypes: ['Mã vật tư', 'Material types'],
    materialsToRestock: ['Cần nhập thêm', 'Items to restock'],
    basedOnShortage: ['Theo danh sách mua và tồn kho bằng 0', 'From purchase list and out-of-stock items'],
    activeProjects: ['Dự án đang có', 'Active projects'], bomProducts: ['Sản phẩm BOM', 'BOM products'],
    configuredProducts: ['Sản phẩm đã cấu hình định mức', 'Products with configured BOMs'],
    restockNeeded: ['Vật tư cần bổ sung', 'Restock required'],
    restockSubtitle: ['Ưu tiên xử lý để không gián đoạn sản xuất', 'Prioritize these items to avoid production delays'],
    viewPurchaseList: ['Danh sách mua', 'Purchase list'], todaysSchedule: ['Lịch trình hôm nay', "Today's schedule"],
    openCalendar: ['Mở lịch', 'Open calendar'], scheduledTasks: ['công việc được lên lịch', 'scheduled tasks'],
    projectsInProgress: ['Dự án đang triển khai', 'Projects in progress'],
    projectsSnapshot: ['Tình hình các dự án hiện có', 'A snapshot of your current projects'],
    viewProjects: ['Xem dự án', 'View projects'], recentTransactions: ['Giao dịch gần đây', 'Recent transactions'],
    recentTransactionsSubtitle: ['Hoạt động xuất / nhập kho mới nhất', 'Latest stock movements'],
    viewHistory: ['Xem lịch sử', 'View history'], workspaceLabel: ['KHÔNG GIAN LÀM VIỆC', 'WORKSPACE'],
    workDashboardSubtitle: ['Theo dõi nhiệm vụ và tiến độ thực hiện trong ngày.', 'Track your daily tasks and progress.'],
    date: ['Ngày:', 'Date:'], tasksToday: ['Công việc hôm nay', "Today's tasks"],
    workWindow: ['Khung giờ làm việc', 'Working hours'], workingHours: ['Thời gian làm việc', 'Scheduled work hours'],
    dailyProgress: ['Tiến độ trong ngày', 'Daily progress'], todaysTasks: ['Công việc trong ngày', 'Tasks for the day'],
    assignees: ['Người phụ trách', 'Assignees'], addPerson: ['Thêm người', 'Add person'],
    enterTeamMember: ['Nhập tên thành viên', 'Enter a team member name'],
    selectTaskAssignees: ['Chọn một hoặc nhiều người; có thể thêm thành viên mới bất cứ lúc nào.', 'Select one or more people; you can add team members at any time.'],
    missingTeamMemberName: ['Vui lòng nhập tên thành viên.', 'Enter a team member name.'],
    existingTeamMember: ['Tên thành viên này đã có trong danh sách.', 'This team member is already in the list.'],
    newTeamMemberAdded: ['Đã thêm thành viên vào danh sách.', 'Team member added to the list.'],
    noTeamMembers: ['Chưa có thành viên. Hãy thêm tên để bắt đầu phân công.', 'No team members yet. Add a name to start assigning tasks.'],
    unassigned: ['Chưa phân công', 'Unassigned'],
    editAssignees: ['Chỉnh người phụ trách', 'Edit assignees'],
    saveAssignees: ['Lưu phân công', 'Save assignment'],
    cancel: ['Hủy', 'Cancel'],
    addMember: ['Thêm', 'Add'],
    editSchedule: ['Điều chỉnh lịch', 'Edit schedule'], reportsEyebrow: ['PHÂN TÍCH VẬN HÀNH', 'OPERATIONS ANALYTICS'],
    reportsTitle: ['Báo cáo thống kê', 'Analytics reports'],
    reportsDescription: ['Số liệu tổng hợp về vật tư, dự án, sản phẩm và tiến độ công việc.', 'Summary of materials, projects, products, and work progress.'],
    printReport: ['In báo cáo', 'Print report'], projects: ['Dự án', 'Projects'],
    completedThisWeek: ['Hoàn thành trong tuần', 'Completed this week'],
    scheduledThisWeek: ['Thời gian đã lên lịch tuần này', 'Scheduled time this week'],
    weeklyCompletion: ['Tỷ lệ hoàn thành tuần này', 'Weekly completion rate'],
    materialStatus: ['Tình trạng vật tư', 'Material status'],
    materialStatusSubtitle: ['Tồn kho và các mặt hàng cần bổ sung', 'Inventory levels and items to replenish'],
    materialName: ['Tên vật tư', 'Material'], warehouseProject: ['Kho / Dự án', 'Warehouse / Project'],
    onHand: ['Tồn kho', 'On hand'], restockQuantity: ['Cần bổ sung', 'To replenish'],
    status: ['Trạng thái', 'Status'], projectProgress: ['Tiến độ dự án', 'Project progress'],
    projectProgressSubtitle: ['Số công việc và tiến độ hoàn thành', 'Task counts and completion progress'],
    productBOMStatus: ['Cấu hình sản phẩm BOM', 'BOM product configuration'],
    productBOMSubtitle: ['Số lượng linh kiện trong từng định mức', 'Component counts in each BOM'],
    guideEyebrow: ['CẨM NANG QUY TRÌNH', 'WORKFLOW PLAYBOOK'], guideTitle: ['Hướng dẫn công việc', 'Work guide'],
    guideDescription: ['Làm theo từng bước để hoàn thiện dự án và sản phẩm, từ chuẩn bị đến nghiệm thu.', 'Follow each step to take a project or product from planning through sign-off.'],
    projectWorkflow: ['Quy trình hoàn thiện dự án / sản phẩm', 'Project / product completion workflow'],
    workflowSubtitle: ['Đánh dấu từng bước; tiến độ được lưu trên thiết bị này.', 'Check off each step; progress is saved on this device.'],
    addWorkflowStep: ['Thêm bước riêng cho quy trình', 'Add a custom workflow step'],
    guideStepPlaceholder: ['Ví dụ: Kiểm tra lần cuối', 'e.g. Final inspection'],
    addStep: ['Thêm bước', 'Add step'], usingTheSystem: ['Hướng dẫn sử dụng', 'How to use the system'],
    usingTheSystemSubtitle: ['Các thao tác thường dùng trong Naphutech Inventory.', 'Common tasks in Naphutech Inventory.'],
    guideInventoryTitle: ['Quản lý vật tư', 'Manage materials'],
    guideInventoryText: ['Tạo mới vật tư, khai báo đơn vị, số lượng, giá và kho dự án. Dùng bộ lọc để tìm nhanh; danh sách mua thể hiện các mặt hàng dự kiến cần bổ sung.', 'Add materials with units, quantities, prices, and project warehouses. Use filters to find items; the purchase list tracks planned replenishment.'],
    guideBomTitle: ['Thiết lập định mức BOM', 'Set up a BOM'],
    guideBomText: ['Tạo sản phẩm, thêm linh kiện và số lượng cần cho mỗi sản phẩm. Chạy dự toán để xác định số lượng cần xuất và phần còn thiếu.', 'Create a product, add components and quantities per unit, then run a calculation to see requirements and shortages.'],
    guideTransactionTitle: ['Lập phiếu xuất / nhập', 'Record stock movements'],
    guideTransactionText: ['Chọn kho, loại giao dịch, vật tư, số lượng và lý do; kiểm tra lại phiếu trước khi lưu. Nhật ký kho ghi nhận người thực hiện và thời điểm.', 'Select the warehouse, movement type, materials, quantities, and reason. Verify the receipt before saving; the history records who did what and when.'],
    guideProjectsTitle: ['Theo dõi dự án và lịch', 'Track projects and schedules'],
    guideProjectsText: ['Tạo dự án, chia thành công việc có thời hạn và mức ưu tiên. Lên lịch theo ngày, cập nhật số lượng hoàn thành để theo dõi tiến độ.', 'Create projects with deadlines and priorities. Schedule tasks by day and update completed quantities to track progress.'],
    troubleshooting: ['Lỗi thường gặp & cách khắc phục', 'Troubleshooting'],
    troubleshootingSubtitle: ['Kiểm tra các bước sau trước khi thao tác lại.', 'Try these checks before repeating an action.'],
    issueShortage: ['Dự toán báo thiếu vật tư dù kho vẫn có hàng', 'A BOM calculation reports a shortage although stock is available'],
    fixShortage: ['Kiểm tra dự án được gán cho vật tư. Dự toán ưu tiên kho của dự án và kho dùng chung; vật tư thuộc dự án khác không được tự động tính vào.', 'Check which project owns the material. Calculations use the project warehouse and shared stock; inventory assigned to other projects is not automatically included.'],
    issueNoSchedule: ['Không thấy công việc trên lịch hôm nay', "A task isn't showing on today's schedule"],
    fixNoSchedule: ['Kiểm tra ngày của lịch, dự án và công việc đã chọn. Mở Lịch để thêm công việc cho đúng ngày hoặc cập nhật khoảng thời gian công việc.', 'Check the selected date, project, and task. Open Calendar to schedule the task on the correct date or update its date range.'],
    issueSave: ['Không lưu được dữ liệu trên trình duyệt', "Data can't be saved in the browser"],
    fixSave: ['Kiểm tra dung lượng lưu trữ của trình duyệt và không xóa dữ liệu trang nếu chưa sao lưu. Tải lại trang rồi thử lưu lại; nếu lỗi còn tiếp diễn, xuất báo cáo cần thiết và liên hệ quản trị viên.', "Check available browser storage and avoid clearing site data before making a backup. Reload and try again; if it persists, export relevant reports and contact an administrator."],
    issueWrongStock: ['Số lượng tồn kho không như dự kiến', 'The stock quantity looks incorrect'],
    fixWrongStock: ['Mở Lịch sử giao dịch để đối chiếu phiếu xuất / nhập gần đây, kho và số lượng từng dòng. Chỉ tạo giao dịch điều chỉnh sau khi đã xác minh phiếu gốc.', 'Review recent receipts, warehouses, and line quantities in Transaction history. Only make an adjustment after verifying the original receipt.'],
    notifications: ['Thông báo', 'Notifications'], reviewInventory: ['Xem kho vật tư', 'Review inventory'],
    signedInAccount: ['Tài khoản đang đăng nhập', 'Signed-in account'],
    activeSession: ['Phiên làm việc đang hoạt động', 'Active session'], signOut: ['Đăng xuất', 'Sign out'],
    emptySchedule: ['Hôm nay chưa có công việc nào được lên lịch.', 'No tasks are scheduled for today.'],
    emptyProjects: ['Chưa có dự án. Hãy tạo dự án để theo dõi tiến độ tại đây.', 'No projects yet. Create a project to track its progress here.'],
    emptyLowStock: ['Không có vật tư cần bổ sung. Kho đang sẵn sàng.', 'No materials need restocking. Inventory is ready.'],
    noTransactions: ['Chưa có giao dịch kho gần đây.', 'No recent inventory transactions.'],
    itemNeeded: ['Cần nhập', 'To order'], outOfStock: ['Hết hàng', 'Out of stock'],
    restock: ['Cần bổ sung', 'Restock'], inStock: ['Đang có hàng', 'In stock'],
    noReportData: ['Chưa có dữ liệu.', 'No data available.'], noBOMItems: ['Chưa có sản phẩm BOM.', 'No BOM products yet.'],
    purchaseListAndOutOfStock: ['Danh sách mua và hàng hết', 'Purchase list and out-of-stock items'],
    languageChanged: ['Đã chuyển ngôn ngữ sang Tiếng Việt.', 'Language changed to English.']
    ,stockMovement: ['Biến động kho', 'Stock movement']
    ,stockMovementSubtitle: ['Lượng vật tư nhập và xuất theo thời gian', 'Material quantities received and issued over time']
    ,daily: ['Ngày', 'Daily'], weekly: ['Tuần', 'Weekly']
    ,stockIn: ['Nhập kho', 'Stock in'], stockOut: ['Xuất kho', 'Stock out']
    ,inventoryMix: ['Cơ cấu vật tư', 'Inventory mix']
    ,inventoryMixSubtitle: ['Phân bổ tồn kho theo nhóm', 'Stock distribution by category']
    ,unitsInStock: ['đơn vị tồn kho', 'units in stock']
    ,transaction: ['Giao dịch', 'Transaction'], movementType: ['Loại', 'Type']
    ,quantity: ['Số lượng', 'Quantity'], performedAt: ['Thời gian', 'Date']
    ,completed: ['Hoàn tất', 'Completed']
    ,dashboardSearchPlaceholder: ['Tìm vật tư, sản phẩm, dự án...', 'Search materials, products, projects...']
    ,dashboardDateRange: ['Khoảng thời gian biểu đồ', 'Chart date range']
    ,last7Days: ['7 ngày qua', 'Last 7 days'], last30Days: ['30 ngày qua', 'Last 30 days']
    ,last90Days: ['90 ngày qua', 'Last 90 days']
    ,noSearchResults: ['Không tìm thấy kết quả phù hợp.', 'No matching results found.']
};

const LEGACY_TRANSLATIONS_VI_EN = {
    'Quản Lý Vật Tư': 'INVENTORY', 'Kho Vật Tư': 'Inventory', 'Dự Toán': 'BOM planning',
    'Xuất / Nhập': 'Stock in / out', 'Danh Sách Mua': 'Purchase list', 'Không Gian Làm Việc': 'WORKSPACE',
    'Lịch': 'Calendar', 'Dự Án': 'Projects', 'Lịch Sử Giao Dịch': 'Transaction history',
    'Kho Vật Tư Linh Kiện': 'Component inventory',
    'Quản lý số lượng tồn kho, đơn giá và nguồn mua sắm': 'Manage stock levels, unit prices, and suppliers',
    'Vật tư': 'Materials', 'Tổng số lượng tồn': 'Total units in stock',
    'Tất cả dự án': 'All projects', 'Tìm tên linh kiện, cửa hàng...': 'Search materials or suppliers...',
    'Chọn tất cả': 'Select all', 'linh kiện': 'components', 'Thêm linh kiện mới': 'Add a material',
    'TÊN LINH KIỆN': 'MATERIAL NAME', 'LOẠI VẬT TƯ': 'MATERIAL TYPE', 'DỰ ÁN': 'PROJECT',
    'ĐƠN VỊ TÍNH': 'UNIT', 'SỐ LƯỢNG TỒN': 'STOCK QUANTITY', 'HÌNH ÁNH (URL)': 'IMAGE (URL)',
    'ĐƠN GIÁ (VND)': 'UNIT PRICE (VND)', 'CỬA HÀNG / LINK MUA': 'SUPPLIER / PURCHASE LINK',
    'NGÀY MUA': 'PURCHASE DATE', 'Hủy': 'Cancel', 'Lưu': 'Save', 'Sửa': 'Edit', 'Xóa': 'Delete',
    'Linh kiện': 'Component', 'Dụng cụ': 'Tool', 'Quản Lý Danh Sách Mua': 'Manage purchase list',
    'Thêm Linh Kiện': 'Add component', 'Lưu BOM': 'Save BOM',
    'Lịch Sử Giao Dịch Kho': 'Inventory transaction history', 'Nhập Kho': 'Stock in',
    'Xuất Kho': 'Stock out', 'Thêm Dự Án': 'Add project', 'Tìm Kiếm': 'Search',
    'TÌM KIẾM DỰ ÁN': 'SEARCH PROJECTS', 'Cập nhật tiến độ công việc': 'Update task progress',
    'Lưu tiến độ': 'Save progress', 'SỐ LƯỢNG ĐÃ LÀM': 'QUANTITY COMPLETED',
    'GHI CHÚ': 'NOTES', 'Thời Gian': 'Date & time', 'Loại Giao Dịch': 'Movement type',
    'Tên Linh Kiện': 'Material name', 'Mã Phiếu': 'Receipt no.', 'Số Lượng': 'Quantity',
    'Người Thực Hiện': 'Performed by', 'Ghi Chú': 'Notes',
    'Tất cả giao dịch': 'All transactions', 'Báo Cáo': 'Reports',
    'Quản Lý Vật Tư': 'INVENTORY', 'Tính Toán Định Mức Linh Kiện Cần Thiết': 'Calculate required components',
    'Chọn Sản Phẩm': 'Select product', 'Số Lượng Sản Xuất': 'Production quantity',
    'Dùng chung': 'Shared stock', 'Dùng chung / Chưa gán dự án': 'Shared / Unassigned',
    'Tất cả': 'All', 'Dùng chung / Chưa gán': 'Shared / Unassigned',
    'sản phẩm': 'products', 'cấu phần vật tư': 'material components',
    'Tồn Kho hiện tại': 'Current stock', 'Số Lượng Xuất/Nhập': 'Movement quantity',
    'Đơn Giá': 'Unit price',
    'Chưa có linh kiện trong sheet. Chọn dự án/kho rồi nhấn “Thêm linh kiện”.':
        'No materials in the sheet yet. Select a project or warehouse, then choose “Add materials”.',
    'Xuất kho': 'Stock out', 'Nhập kho': 'Stock in',
    'Tìm mã phiếu, dự án hoặc người thực hiện': 'Search receipt, project, or operator',
    'Đóng thông báo': 'Close notification',
    'Danh sách chi tiết tất cả sản phẩm và định mức linh kiện': 'Detailed list of products and component requirements',
    'Quay lại': 'Back', 'Sửa BOM': 'Edit BOM',
    'Chi phí linh kiện / 1 SP:': 'Component cost per product:',
    'Chọn dự án/kho': 'Select a project / warehouse', 'Chọn sản phẩm': 'Select a product',
    'Thêm linh kiện vào sheet': 'Add materials to sheet',
    'Chọn linh kiện từ toàn bộ kho vật tư và số lượng cần đưa vào sheet. Dự án/kho được chọn bên ngoài chỉ là kho đích khi lập phiếu.':
        'Choose materials from inventory and set quantities to add to the sheet. The project or warehouse selected outside this dialog is only the destination when recording the movement.',
    'Chọn': 'Select', 'Tên linh kiện': 'Material name', 'Kho hiện có': 'Current warehouse',
    'Số lượng': 'Quantity', 'Thêm vào sheet': 'Add to sheet',
    'Phiếu xuất linh kiện theo sản phẩm': 'Product-based material issue',
    'Chỉ thực hiện xuất kho theo định mức sản phẩm; không hỗ trợ nhập kho.':
        'This form issues stock according to a product BOM; stock-in is not supported.',
    'NGÀY, THÁNG, NĂM VÀ THỜI GIAN LẬP PHIẾU': 'RECEIPT DATE AND TIME',
    'NGƯỜI LÀM PHIẾU': 'PREPARED BY', 'DỰ ÁN / KHO': 'PROJECT / WAREHOUSE',
    'ĐỊA ĐIỂM': 'LOCATION', 'SẢN PHẨM BOM': 'BOM PRODUCT',
    'SỐ LƯỢNG SẢN PHẨM': 'PRODUCT QUANTITY', 'LÝ DO': 'REASON',
    'Kho xuất': 'Source warehouse', 'Số lượng xuất': 'Quantity to issue',
    'Chọn dự án/kho và sản phẩm để xem linh kiện cần xuất.':
        'Select a project / warehouse and product to review the materials to issue.',
    'Xuất': 'Issue', 'Thiếu linh kiện trong kho': 'Insufficient inventory',
    'Bạn có thêm vào danh sách mua số lượng còn thiếu không?':
        'Would you like to add the shortage to the purchase list?',
    'TÊN SẢN PHẨM / BO MẠCH': 'PRODUCT / BOARD NAME',
    'TÊN DỰ ÁN': 'PROJECT NAME',
    'Biên bản kho': 'Inventory receipt', 'Phiếu Xuất/Nhập Kho': 'Stock Movement Receipt',
    'Số phiếu': 'Receipt number', 'Người làm phiếu:': 'Prepared by:',
    'Dự án:': 'Project:', 'Xuất/Nhập từ kho:': 'Stock movement warehouse:',
    'Địa điểm:': 'Location:', 'Lý do:': 'Reason:', 'Ảnh': 'Image',
    'Loại': 'Type', 'Dự án kho': 'Warehouse / project', 'Thành tiền': 'Line total',
    'Nguồn': 'Supplier', 'Tổng số mặt hàng:': 'Total line items:',
    'Tổng số lượng:': 'Total quantity:', 'Tổng tiền:': 'Total amount:',
    'Người giao / nhận': 'Issued to / received from',
    '(Ký, ghi rõ họ tên)': '(Signature and printed name)',
    'Người làm phiếu': 'Prepared by', 'In phiếu': 'Print receipt',
    'Ghi chú': 'Notes', 'Hủy': 'Cancel', 'Lưu Dự Án': 'Save project',
    'Tìm linh kiện trong kho...': 'Search inventory materials...',
    'Nhập tên người làm phiếu': 'Enter the preparer name',
    'Nhập địa điểm xuất (không bắt buộc)': 'Enter issue location (optional)',
    'Nhập lý do xuất kho (không bắt buộc)': 'Enter issue reason (optional)',
    'Nhập địa điểm': 'Enter a location',
    'Nhập lý do xuất / nhập kho': 'Enter a stock movement reason',
    'Tổng quan trạng thái kho': 'Inventory status overview',
    'Lọc theo dự án': 'Filter by project',
    'Tìm mã phiếu, dự án hoặc người thực hiện...': 'Search receipt, project, or operator...',
    'Người phụ trách': 'Assignees',
    'Nhập tên thành viên': 'Enter a team member name',
    'Thêm người': 'Add person',
    'Chọn người phụ trách cho công việc này.': 'Choose who is responsible for this task.',
    'Chưa có thành viên. Hãy thêm tên để bắt đầu phân công.': 'No team members yet. Add a name to start assigning tasks.',
    'Chưa phân công': 'Unassigned',
    'Vui lòng nhập tên thành viên.': 'Enter a team member name.',
    'Tên thành viên này đã có trong danh sách.': 'This team member is already in the list.',
    'Đã thêm thành viên vào danh sách.': 'Team member added to the list.',
    'Lọc theo loại giao dịch': 'Filter by movement type',
    'công việc': 'tasks', 'Sửa': 'Edit', 'Xóa': 'Delete',
    'Lưu dữ liệu thất bại. Bộ nhớ trình duyệt có thể đã đầy hoặc không khả dụng.':
        'Could not save data. Browser storage may be full or unavailable.',
    'Đăng nhập thất bại. Vui lòng kiểm tra tên đăng nhập và mật khẩu.':
        'Sign-in failed. Check your username and password.',
    'Đăng nhập thành công.': 'Signed in successfully.',
    'Cập nhật tiến độ thất bại. Không tìm thấy kế hoạch công việc.':
        'Could not update progress. The work plan could not be found.',
    'Cập nhật tiến độ thất bại. Không tìm thấy công việc trong dự án.':
        'Could not update progress. The task could not be found in the project.',
    'Điều chỉnh tiến độ công việc thành công.': 'Work progress adjusted successfully.',
    'Cập nhật tiến độ công việc thành công.': 'Work progress updated successfully.',
    'Lưu dự án thất bại. Vui lòng nhập tên cho tất cả công việc hoặc xóa dòng trống.':
        'Could not save the project. Name every task or remove blank rows.',
    'Lưu dự án thất bại. Số lượng cần làm phải là số nguyên lớn hơn hoặc bằng 1.':
        'Could not save the project. Task quantities must be whole numbers of at least 1.',
    'Lưu dự án thất bại. Vui lòng nhập cả ngày bắt đầu và ngày kết thúc cho công việc.':
        'Could not save the project. Enter both start and end dates for each task.',
    'Lưu dự án thất bại. Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.':
        'Could not save the project. The end date must be on or after the start date.',
    'Cập nhật dự án thành công.': 'Project updated successfully.',
    'Thêm dự án thành công.': 'Project added successfully.',
    'Thêm dự án vào kế hoạch thất bại. Vui lòng chọn dự án.':
        'Could not add the project to the plan. Select a project first.',
    'Lưu kế hoạch công việc thành công.': 'Work plan saved successfully.',
    'Cập nhật vật tư thành công.': 'Material updated successfully.',
    'Thêm vật tư thành công.': 'Material added successfully.',
    'Xóa vật tư thất bại. Vui lòng tích chọn ít nhất 1 sản phẩm.':
        'Could not delete materials. Select at least one item.',
    'Không có linh kiện thiếu để thêm vào danh sách mua hàng.':
        'There are no component shortages to add to the purchase list.',
    'Lưu BOM thất bại. Vui lòng nhập tên sản phẩm.':
        'Could not save the BOM. Enter a product name.',
    'Cập nhật cấu hình BOM thành công.': 'BOM updated successfully.',
    'Thêm cấu hình BOM thành công.': 'BOM added successfully.',
    'Không thể thêm danh sách mua. Không có dữ liệu linh kiện còn thiếu.':
        'Could not create the purchase list. There are no component shortages.',
    'Xuất theo sản phẩm thất bại. Thời gian lập phiếu không hợp lệ.':
        'Product issue failed. The receipt date and time are invalid.',
    'Xuất theo sản phẩm thất bại. Số lượng sản phẩm phải là số nguyên lớn hơn 0.':
        'Product issue failed. Product quantity must be a whole number greater than 0.',
    'Xuất theo sản phẩm thất bại. Sản phẩm chưa có định mức BOM hợp lệ hoặc dự án/kho không hợp lệ.':
        'Product issue failed. The product BOM or selected project / warehouse is invalid.',
    'Xuất theo sản phẩm thất bại. Tồn kho đã thay đổi, vui lòng kiểm tra lại định mức và tồn kho.':
        'Product issue failed. Stock has changed; review the BOM and inventory, then try again.',
    'Thêm linh kiện thất bại. Vui lòng tích chọn ít nhất một linh kiện.':
        'Could not add materials. Select at least one item.',
    'Thêm linh kiện thất bại. Có linh kiện không còn trong kho vật tư.':
        'Could not add materials. One or more items are no longer in inventory.',
    'Tạo phiếu thất bại. Vui lòng nhập người làm phiếu và chọn một dự án/kho cụ thể.':
        'Could not create the receipt. Enter the preparer and select a project / warehouse.',
    'Nhập kho thất bại. Không có vật tư hợp lệ được chọn.':
        'Stock-in failed. No valid materials were selected.',
    'Xuất kho thất bại. Không có vật tư hợp lệ được chọn.':
        'Stock-out failed. No valid materials were selected.',
    'Không thể mở phiếu. Không tìm thấy dữ liệu phiếu trong lịch sử.':
        'Could not open the receipt. No matching history record was found.',
    'Cập nhật số lượng cần mua thành công.': 'Purchase quantity updated successfully.',
    'Cập nhật đơn giá thành công.': 'Unit price updated successfully.',
    'Xóa vật tư khỏi danh sách mua thành công.': 'Material removed from the purchase list.',
    'Xóa lịch sử giao dịch thành công.': 'Transaction history cleared successfully.',
    'Xuất danh sách kho vật tư thành công.': 'Inventory exported successfully.',
    'Xuất danh sách mua hàng thành công.': 'Purchase list exported successfully.',
    'Đã mở chức năng in hoặc lưu PDF.': 'Print or save as PDF is ready.',
    'Tên sản phẩm / bo mạch': 'Product / board name',
    'Cấu hình định mức linh kiện sản phẩm': 'Configure product BOM',
    'Cấu hình các linh kiện thành phần': 'Configure product components',
    'Chọn linh kiện từ Kho vào Danh sách mua': 'Select inventory items for purchase',
    'Sản phẩm BOM': 'BOM product', 'Tìm tên linh kiện trong kho...': 'Search inventory materials...',
    'Thêm Vào Danh Sách Mua': 'Add to purchase list', 'Đóng': 'Close',
    'Quản lý dự án': 'Project management', 'Tên Dự Án': 'Project name',
    'Số Lượng Công Việc': 'Task count', 'Đã Hoàn Thành': 'Completed',
    'Phần Trăm Hoàn Thành': 'Completion rate', 'Tìm tên dự án cần tìm...': 'Search projects...',
    'Tìm kiếm dự án...': 'Search projects...', 'Nhập tên dự án cần tìm...': 'Enter a project name...',
    'Công việc trong ngày': 'Tasks for the day', 'Thời gian làm việc': 'Working hours',
    'Tiến độ trong ngày': 'Daily progress', 'Lịch Trình Trong Ngày': "Today's schedule",
    'Công Việc Trong Ngày': "Today's tasks", 'Dự Án Đang Thực Hiện': 'Projects in progress',
    'MỤC TIÊU CHÍNH': 'MAIN OBJECTIVE', 'Hoàn thành Dự án trong 50 day': 'Complete the project in 50 days',
    'Từ': 'From', 'đến': 'to', 'Bình thường': 'Normal', 'Quan trọng': 'Important',
    'Gấp': 'Urgent', 'Dễ': 'Easy', 'Chưa có dự án': 'No projects yet',
    'Chưa có công việc': 'No tasks yet', 'Lưu Dự Án': 'Save project',
    'Cấu hình công việc để có thể lên lịch trong tab Lịch': 'Configure tasks to schedule them in Calendar',
    'Danh sách công việc': 'Task list', 'Thêm Công Việc': 'Add task',
    'Ngày bắt đầu': 'Start date', 'Ngày kết thúc': 'End date',
    'Số lượng cần làm': 'Quantity to complete', 'Mức độ cần thiết': 'Priority',
    'Lập Kế Hoạch Công Việc': 'Plan work', 'Có thể đặt giờ riêng cho từng công việc trong ngày đang chọn.': 'Set a separate time for each task on the selected day.',
    'Lưu Kế Hoạch': 'Save plan', 'Không tìm thấy giao dịch phù hợp.': 'No matching transactions found.',
    'Thêm': 'Add', 'Thêm linh kiện mới': 'Add material', 'Tên đăng nhập': 'Username', 'Mật khẩu': 'Password',
    'Đăng nhập hệ thống': 'Sign in', 'Hệ thống kho điện tử và tính toán BOM đang hoạt động ổn định.': 'Inventory and BOM calculations are running smoothly.',
    'Online': 'Online', 'Chọn ngôn ngữ': 'Choose language', 'Thông báo': 'Notifications',
    'Tài khoản đang đăng nhập': 'Signed-in account', 'Đăng xuất / Đổi tài khoản': 'Sign out',
    'Đơn giá': 'Unit price', 'Tồn kho': 'In stock', 'Tồn Hiện Tại': 'Current stock',
    'Cửa Hàng / Link Mua': 'Supplier / purchase link', 'Ngày Mua': 'Purchase date',
    'Số Lượng Cần Mua': 'Quantity to purchase', 'Thành Tiền': 'Line total',
    'TỔNG TẤT CẢ THÀNH TIỀN:': 'TOTAL:',
    'Sao chép': 'Copy', 'Xem link': 'View link', 'Xem chi tiết': 'View details',
    'Nhập tên dự án...': 'Enter project name...', 'VD: Tụ hóa...': 'e.g. Capacitor...',
    'Shopee, LCSC hoặc URL link...': 'Supplier name or URL...',
    'Lịch giao dịch kho': 'Inventory history', 'Xuất PDF': 'Export PDF', 'Xuất Sheet': 'Export spreadsheet'
    ,'Dự Toán & Cấu Hình BOM': 'BOM planning & configuration'
    ,'Tính toán số lượng linh kiện cần thiết theo số lượng sản phẩm dự kiến': 'Calculate required components for a target production quantity'
    ,'CHỌN SẢN PHẨM': 'SELECT PRODUCT', '-- Chọn sản phẩm --': '-- Select a product --'
    ,'SỐ LƯỢNG': 'QUANTITY', 'Cấu Hình Sản Phẩm': 'Configure product'
    ,'Chi Tiết Vật Tư Cần Thiết': 'Required materials'
    ,'Thêm DS Mua': 'Add to purchase list', 'Hình': 'Image', 'ĐVT': 'Unit'
    ,'SL Cần Thiết': 'Required', 'Tồn Kho Hiện Tại': 'Current stock'
    ,'Cần Mua Thêm': 'To purchase', 'Nguồn / Link Mua': 'Supplier / purchase link'
    ,'Sản phẩm đã cấu hình': 'Configured products', 'sản phẩm BOM': 'BOM products'
    ,'Sản Phẩm Đã Cấu Hình BOM': 'Configured BOM products'
    ,'Quản Lý Xuất / Nhập Kho': 'Stock in / out management'
    ,'Thao tác xuất nhập lẻ hoặc tích chọn xuất nhập hàng loạt nhanh chóng': 'Record a single or bulk stock movement'
    ,'Thao Tác Xuất/Nhập': 'Stock movement actions', 'Thêm linh kiện': 'Add materials'
    ,'Xuất theo sản phẩm': 'Issue by product', 'Thông tin phiếu xuất / nhập': 'Stock receipt details'
    ,'THỜI GIAN LẬP PHIẾU': 'RECEIPT DATE & TIME', 'NGƯỜI LÀM PHIẾU': 'PERFORMED BY'
    ,'DỰ ÁN / KHO': 'PROJECT / WAREHOUSE', 'Chọn dự án': 'Select a project'
    ,'ĐỊA ĐIỂM XUẤT / NHẬP': 'STOCK MOVEMENT LOCATION', 'LÝ DO': 'REASON'
    ,'Thêm linh kiện từ toàn bộ kho vật tư vào sheet. Dự án/kho chỉ là nơi nhận hoặc xuất các linh kiện đã chọn.': 'Add materials from inventory to the sheet. The selected project or warehouse is used as the destination or source.'
    ,'Tên Linh Kiện / Dụng Cụ': 'Material / tool name', 'Kho tham chiếu': 'Reference warehouse'
    ,'Quản lý linh kiện cần mua và theo dõi tổng chi phí dự kiến': 'Manage planned purchases and track estimated costs'
    ,'Đơn Giá (VND)': 'Unit price (VND)', 'Thao Tác': 'Actions', 'Xóa Lịch Sử': 'Clear history'
    ,'Nhật ký biến động xuất/nhập vật tư linh kiện theo thời gian': 'A chronological log of inventory movements'
    ,'Chọn một ngày để lập kế hoạch công việc': 'Select a date to plan tasks', 'Tháng / Năm': 'Month / year'
    ,'Thứ 2': 'Mon', 'Thứ 3': 'Tue', 'Thứ 4': 'Wed', 'Thứ 5': 'Thu'
    ,'Thứ 6': 'Fri', 'Thứ 7': 'Sat', 'Chủ Nhật': 'Sun'
    ,'Quản lý Dự Án': 'Project management', 'Số lượng công việc': 'Task count'
    ,'Hoàn thành': 'Completed', 'TÌM KIẾM TÊN DỰ ÁN': 'SEARCH PROJECT NAME'
    ,'Chưa có dự án nào được thêm.': 'No projects have been added.'
    ,'Tất Cả Dự Án': 'All projects', 'Xem và chỉnh sửa cấu hình dự án': 'View and edit project configuration'
    ,'Chưa có dự án. Nhấn “Thêm Dự Án” để bắt đầu.': 'No projects yet. Select “Add project” to get started.'
    ,'Linh kiện khác': 'Other component', 'Linh kiện thụ động': 'Passive components'
    ,'Cảm biến': 'Sensors', 'Mạch': 'Boards', 'IC/Chip': 'IC / Chip'
    ,'Chọn sản phẩm BOM vào Danh sách mua': 'Select a BOM product for the purchase list'
    ,'Tìm tên sản phẩm BOM...': 'Search BOM products...'
    ,'Tất cả loại vật tư': 'All material categories', 'Dụng cụ': 'Tools'
    ,'Phân trang kho vật tư': 'Inventory pagination', 'Trang trước': 'Previous page'
    ,'Trang sau': 'Next page', 'Trang đầu': 'First page', 'Trang cuối': 'Last page'
};

const TRANSLATION_MAPS = {
    en: Object.fromEntries([
        ...Object.values(UI_TRANSLATIONS).map(([vi, en]) => [vi, en]),
        ...Object.entries(LEGACY_TRANSLATIONS_VI_EN)
    ]),
    vi: Object.fromEntries([
        ...Object.values(UI_TRANSLATIONS).map(([vi, en]) => [en, vi]),
        ...Object.entries(LEGACY_TRANSLATIONS_VI_EN).map(([vi, en]) => [en, vi])
    ])
};

// ================= THÔNG BÁO, THEME VÀ TÙY CHỌN NGƯỜI DÙNG =================
function showNotification(message, type = 'success') {
    const region = document.getElementById('notificationRegion');
    if (!region) return;

    const notification = document.createElement('div');
    const isSuccess = type === 'success';
    notification.className = `app-notification ${isSuccess ? 'is-success' : 'is-error'}`;
    notification.setAttribute('role', isSuccess ? 'status' : 'alert');

    const icon = document.createElement('i');
    icon.className = `app-notification-icon fa-solid ${isSuccess ? 'fa-circle-check' : 'fa-circle-exclamation'}`;
    icon.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.className = 'app-notification-message';
    text.textContent = message;

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'app-notification-close';
    closeButton.setAttribute('aria-label', 'Đóng thông báo');
    closeButton.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
    closeButton.addEventListener('click', () => dismissNotification(notification));

    notification.append(icon, text, closeButton);
    region.appendChild(notification);
    window.setTimeout(() => dismissNotification(notification), 5000);
}

function applyAppTheme(theme) {
    const app = document.getElementById('appShell');
    if (!app) return;
    app.dataset.theme = theme;
    document.documentElement.dataset.appTheme = theme;
    appTheme = theme;
}

function setAppTheme(theme) {
    if (theme !== 'dark' && theme !== 'light') {
        notifyFailure(appLanguage === 'en' ? 'Choose a supported appearance mode.' : 'Vui lòng chọn chế độ giao diện hợp lệ.');
        return;
    }
    applyAppTheme(theme);
    persistToLocalStorage(STORAGE_KEY_APP_THEME, theme);
    renderSettingsControls();
    notifySuccess(appText('settingSaved'));
}

function renderSettingsControls() {
    document.querySelectorAll('[data-app-theme-option]').forEach(button => {
        const selected = button.dataset.appThemeOption === appTheme;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', String(selected));
    });
    const lowStock = document.getElementById('settingLowStockNotifications');
    const schedule = document.getElementById('settingScheduleNotifications');
    if (lowStock) lowStock.checked = notificationPreferences.lowStock;
    if (schedule) schedule.checked = notificationPreferences.schedule;
}

function updateNotificationPreference(preference, enabled) {
    if (preference !== 'lowStock' && preference !== 'schedule') {
        notifyFailure(appLanguage === 'en' ? 'Unknown notification setting.' : 'Không tìm thấy cài đặt thông báo.');
        return;
    }
    notificationPreferences[preference] = Boolean(enabled);
    const storageKey = preference === 'lowStock'
        ? STORAGE_KEY_NOTIFICATION_LOW_STOCK
        : STORAGE_KEY_NOTIFICATION_SCHEDULE;
    persistToLocalStorage(storageKey, String(Boolean(enabled)));
    renderTopbarNotifications();
    notifySuccess(appText('settingSaved'));
}

function dismissNotification(notification) {
    if (!notification.isConnected) return;
    notification.classList.add('is-leaving');
    notification.addEventListener('animationend', () => notification.remove(), { once: true });
}

function notifyFailure(message) {
    showNotification(message, 'error');
}

function notifySuccess(message) {
    showNotification(message, 'success');
}

function persistToLocalStorage(key, value) {
    try {
        localStorage.setItem(key, value);
        if (SHARED_WORKSPACE_STORAGE_KEYS.includes(key)) {
            queueWorkspaceStorageSync(key);
        }
    } catch (error) {
        notifyFailure('Lưu dữ liệu thất bại. Bộ nhớ trình duyệt có thể đã đầy hoặc không khả dụng.');
        throw error;
    }
}

function queueWorkspaceStorageSync(key) {
    if (!workspaceSyncEnabled || !currentAuthUser || !supabaseClient) return;
    pendingWorkspaceStorageKeys.add(key);
    window.clearTimeout(workspaceSyncTimer);
    workspaceSyncTimer = window.setTimeout(() => {
        workspaceSyncTimer = null;
        const changedKeys = [...pendingWorkspaceStorageKeys];
        pendingWorkspaceStorageKeys.clear();
        if (changedKeys.length) {
            workspaceSyncQueue = workspaceSyncQueue
                .then(() => persistWorkspacePatch(changedKeys))
                .catch(error => {
                    notifyFailure(`Không thể đồng bộ dữ liệu nhóm lên đám mây: ${error.message}`);
                });
        }
    }, 400);
}

async function persistWorkspacePatch(keys) {
    if (!workspaceSyncEnabled || !currentAuthUser || !supabaseClient) return;
    const patch = Object.fromEntries(keys.map(key => {
        const rawValue = localStorage.getItem(key);
        return [key, rawValue === null ? null : JSON.parse(rawValue)];
    }));
    const { error } = await supabaseClient.rpc('save_workspace_state', { p_patch: patch });
    if (error) throw error;
}

function buildWorkspaceSnapshot() {
    const storage = Object.fromEntries(SHARED_WORKSPACE_STORAGE_KEYS.map(key => {
        const rawValue = localStorage.getItem(key);
        return [key, rawValue === null ? null : JSON.parse(rawValue)];
    }));
    return { initialized: true, storage };
}

function applyWorkspaceSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || !snapshot.storage || typeof snapshot.storage !== 'object') {
        throw new Error('Dữ liệu không gian làm việc trên đám mây không hợp lệ.');
    }
    workspaceSyncEnabled = false;
    window.clearTimeout(workspaceSyncTimer);
    workspaceSyncTimer = null;
    pendingWorkspaceStorageKeys.clear();
    try {
        SHARED_WORKSPACE_STORAGE_KEYS.forEach(key => {
            const value = snapshot.storage[key];
            if (value === null || value === undefined) localStorage.removeItem(key);
            else localStorage.setItem(key, JSON.stringify(value));
        });
        inventoryData = readWorkspaceArray(STORAGE_KEY_INV, inventoryData);
        bomProducts = readWorkspaceArray(STORAGE_KEY_BOM, bomProducts);
        procurementList = readWorkspaceArray(STORAGE_KEY_PROC, procurementList);
        historyLogs = readWorkspaceArray(STORAGE_KEY_LOGS, historyLogs);
        transactionReceipts = readWorkspaceArray(STORAGE_KEY_TX_RECEIPTS, transactionReceipts);
        workspaceProjects = readWorkspaceArray(STORAGE_KEY_WORKSPACE_PROJECTS, workspaceProjects);
        workspacePlans = readWorkspaceArray(STORAGE_KEY_WORKSPACE_PLANS, workspacePlans);
        guideSteps = readWorkspaceArray(STORAGE_KEY_GUIDE_STEPS, guideSteps);
        sharedGuideContent = readWorkspaceArray(STORAGE_KEY_GUIDE_CONTENT, []);
        sharedTodos = readWorkspaceArray(STORAGE_KEY_SHARED_TODOS, []);
        sharedNotes = readWorkspaceArray(STORAGE_KEY_SHARED_NOTES, []);
        workspaceMembers = normalizeWorkspaceMemberNames(
            readWorkspaceArray(STORAGE_KEY_WORKSPACE_MEMBERS, workspaceMembers)
        );
    } finally {
        workspaceSyncEnabled = Boolean(currentAuthUser);
    }
}

function readWorkspaceArray(key, fallback) {
    const rawValue = localStorage.getItem(key);
    if (rawValue === null) return fallback;
    const value = JSON.parse(rawValue);
    if (!Array.isArray(value)) throw new Error(`Dữ liệu "${key}" không đúng định dạng.`);
    return value;
}

async function loadWorkspaceFromCloud(user) {
    const { data, error } = await supabaseClient
        .from('workspace_state')
        .select('state')
        .eq('id', 1)
        .maybeSingle();
    if (error) throw error;
    if (!data || data.state?.initialized !== true) {
        const initialState = buildWorkspaceSnapshot();
        const { data: savedState, error: saveError } = await supabaseClient.rpc(
            'initialize_workspace_state',
            { p_initial: initialState }
        );
        if (saveError) throw saveError;
        applyWorkspaceSnapshot(savedState);
        return;
    }
    applyWorkspaceSnapshot(data.state);
}

function renderWorkspaceAfterRemoteUpdate() {
    populateInventoryProjectSelects();
    renderInventory();
    renderBOMProducts();
    populateTransactionProjectSelect();
    renderBatchTxSheet();
    renderProcurement();
    renderHistory();
    updateDataLists();
    renderWorkspaceCalendar();
    renderWorkspaceDashboard();
    renderGuideWorkflow();
    renderWorkspaceProjects();
    renderSharedGuideContent();
    renderTopbarNotifications();
}

// ================= DỊCH NỘI DUNG VÀ ĐỊNH DẠNG NGÔN NGỮ =================
function appText(key) {
    const entry = UI_TRANSLATIONS[key];
    return entry ? entry[appLanguage === 'en' ? 1 : 0] : key;
}

function translateUiValue(value) {
    const translations = TRANSLATION_MAPS[appLanguage];
    const exactMatch = translations[value];
    if (exactMatch) return exactMatch;

    const countMatch = value.match(/(^|\s)(\d[\d,.]*)\s+(.+)$/);
    if (countMatch && translations[countMatch[3]]) {
        return `${value.slice(0, countMatch.index)}${countMatch[1]}${countMatch[2]} ${translations[countMatch[3]]}`;
    }

    const prefix = Object.keys(translations)
        .filter(source =>
            value.startsWith(`${source} `) &&
            (source.includes(' ') || ['Sửa', 'Xóa', 'Chọn'].includes(source))
        )
        .sort((left, right) => right.length - left.length)[0];
    return prefix ? `${translations[prefix]}${value.slice(prefix.length)}` : null;
}

function translateTextNode(node) {
    const value = node.nodeValue || '';
    const trimmed = value.trim();
    if (!trimmed) return;
    const translated = translateUiValue(trimmed);
    if (translated && translated !== trimmed) {
        const leading = value.match(/^\s*/)?.[0] || '';
        const trailing = value.match(/\s*$/)?.[0] || '';
        node.nodeValue = `${leading}${translated}${trailing}`;
    }
}

function translateSubtree(root = document.body) {
    root.querySelectorAll?.('[data-i18n]').forEach(element => {
        const entry = UI_TRANSLATIONS[element.dataset.i18n];
        if (entry && element.children.length === 0) {
            element.textContent = entry[appLanguage === 'en' ? 1 : 0];
        }
    });
    root.querySelectorAll?.('[data-i18n-placeholder]').forEach(element => {
        const entry = UI_TRANSLATIONS[element.dataset.i18nPlaceholder];
        if (entry) element.setAttribute('placeholder', entry[appLanguage === 'en' ? 1 : 0]);
    });

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode) {
        if (!textNode.parentElement?.closest('script, style, textarea, input')) {
            translateTextNode(textNode);
        }
        textNode = walker.nextNode();
    }
    root.querySelectorAll?.('[placeholder], [title], [aria-label]').forEach(element => {
        ['placeholder', 'title', 'aria-label'].forEach(attribute => {
            const value = element.getAttribute(attribute);
            const translated = value && translateUiValue(value);
            if (translated) element.setAttribute(attribute, translated);
        });
    });
}

function initializeLanguageSupport() {
    const selector = document.getElementById('languageSelector');
    if (selector) selector.value = appLanguage;
    document.documentElement.lang = appLanguage;
    translateSubtree();
    const observer = new MutationObserver(records => {
        observer.disconnect();
        records.forEach(record => {
            if (record.type === 'characterData') translateSubtree(record.target.parentElement || document.body);
            record.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) translateSubtree(node);
                else if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
            });
        });
        observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
}

function setAppLanguage(language) {
    if (language !== 'vi' && language !== 'en') {
        notifyFailure('Language change failed. Please choose a supported language.');
        return;
    }
    appLanguage = language;
    persistToLocalStorage(STORAGE_KEY_APP_LANGUAGE, language);
    document.documentElement.lang = language;
    translateSubtree();
    renderTopbarAccount();
    renderSettingsControls();
    if (appInitialized) {
        renderInventory();
        renderWorkspaceDashboard();
        renderDashboardOverview();
        renderWorkspaceReports();
        renderGuideWorkflow();
    }
    notifySuccess(appText('languageChanged'));
}

function formatNumber(value) {
    return (Number(value) || 0).toLocaleString(appLanguage === 'en' ? 'en-US' : 'vi-VN');
}

// ================= POPOVER, TÀI KHOẢN VÀ TỔNG QUAN TRÊN THANH ĐẦU =================
function toggleTopbarPopover(popoverId) {
    const target = document.getElementById(popoverId);
    if (!target) return;
    const shouldOpen = target.classList.contains('hidden');
    closeTopbarPopovers();
    if (shouldOpen) {
        target.classList.remove('hidden');
        const button = document.getElementById(popoverId === 'accountPopover' ? 'accountButton' : 'notificationButton');
        button?.setAttribute('aria-expanded', 'true');
    }
}

function closeTopbarPopovers() {
    ['notificationPopover', 'accountPopover'].forEach(popoverId => {
        document.getElementById(popoverId)?.classList.add('hidden');
    });
    document.getElementById('notificationButton')?.setAttribute('aria-expanded', 'false');
    document.getElementById('accountButton')?.setAttribute('aria-expanded', 'false');
}

function renderTopbarAccount() {
    const rawName = document.getElementById('currentUserDisplay')?.textContent.trim() || activeUserName;
    const name = rawName.toLocaleLowerCase() === 'admin' ? 'Naphutech Admin' : rawName;
    const initial = name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toLocaleUpperCase(appLanguage);
    ['topbarUserName', 'accountPopoverName'].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = name;
    });
    ['topbarUserInitials', 'accountPopoverInitials'].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = initial;
    });
}

// ================= THỐNG KÊ, BIỂU ĐỒ VÀ TÌM KIẾM TỔNG QUAN =================
function getInventoryShortages() {
    const shortageMap = new Map();
    procurementList.forEach(entry => {
        const needed = Math.max(0, Number(entry.qtyToBuy) || 0);
        const item = inventoryData.find(candidate => String(candidate.id) === String(entry.componentId));
        if (!item || !needed) return;
        const existing = shortageMap.get(String(item.id));
        shortageMap.set(String(item.id), {
            item,
            needed: Math.max(needed, existing?.needed || 0)
        });
    });
    inventoryData.forEach(item => {
        if ((Number(item.qty) || 0) <= 0 && !shortageMap.has(String(item.id))) {
            shortageMap.set(String(item.id), { item, needed: 0 });
        }
    });
    return [...shortageMap.values()].sort((first, second) =>
        (Number(first.item.qty) || 0) - (Number(second.item.qty) || 0) ||
        String(first.item.name).localeCompare(String(second.item.name), appLanguage)
    );
}

function renderDashboardOverview() {
    const today = localDateString(new Date());
    const todayLabel = document.getElementById('overviewTodayLabel');
    if (todayLabel) todayLabel.textContent = formatWorkspaceDate(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const rawUser = document.getElementById('currentUserDisplay')?.textContent.trim() || activeUserName || 'Naphutech Admin';
    const user = rawUser.toLocaleLowerCase() === 'admin' ? 'Naphutech Admin' : rawUser;
    const welcomeUser = document.getElementById('overviewUserName');
    if (welcomeUser) welcomeUser.textContent = user;

    const totalQuantity = inventoryData.reduce((sum, item) => sum + Math.max(0, Number(item.qty) || 0), 0);
    const shortages = getInventoryShortages();
    const taskCount = workspaceProjects.reduce((sum, project) => sum + project.tasks.length, 0);
    const setText = (id, text) => {
        const element = document.getElementById(id);
        if (element) element.textContent = text;
    };
    setText('overviewMaterialCount', formatNumber(inventoryData.length));
    setText('overviewStockSummary', `${appLanguage === 'en' ? 'Total units in stock:' : 'Tổng số lượng tồn:'} ${formatNumber(totalQuantity)}`);
    setText('overviewLowStockCount', formatNumber(shortages.length));
    setText('overviewProjectCount', formatNumber(workspaceProjects.length));
    setText('overviewProjectSummary', `${formatNumber(taskCount)} ${appLanguage === 'en' ? 'tasks across projects' : 'công việc trong các dự án'}`);
    setText('overviewProductCount', formatNumber(bomProducts.length));
    setText('overviewScheduleDate', todayLabel?.textContent || '');
    setText('overviewWelcomeSummary', shortages.length
        ? (appLanguage === 'en'
            ? `Inventory and project data are up to date. ${shortages.length} item${shortages.length === 1 ? '' : 's'} need attention.`
            : `Dữ liệu kho và dự án đã được cập nhật. Có ${shortages.length} vật tư cần chú ý.`)
        : (appLanguage === 'en'
            ? 'Inventory, projects, and today’s schedule are ready to review.'
            : 'Cùng xem nhanh tình trạng kho, dự án và lịch trình hôm nay.'));

    const lowStockList = document.getElementById('overviewLowStockList');
    if (lowStockList) {
        lowStockList.replaceChildren();
        if (!shortages.length) {
            lowStockList.innerHTML = `<p class="overview-empty-state"><i class="fa-solid fa-circle-check" aria-hidden="true"></i>${appText('emptyLowStock')}</p>`;
        }
        shortages.slice(0, 5).forEach(({ item, needed }) => {
            const row = document.createElement('div');
            row.className = 'overview-material-row';
            const current = Math.max(0, Number(item.qty) || 0);
            row.innerHTML = `<span class="overview-material-icon"><i class="fa-solid fa-cube" aria-hidden="true"></i></span>
                <span class="overview-row-main"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(getInventoryWarehouseName(item))}</small></span>
                <span class="overview-stock-quantity${current ? '' : ' is-empty'}">${formatNumber(current)} ${escapeHtml(item.unit || '')}</span>
                <span class="overview-shortage-badge">${needed ? `${appText('itemNeeded')} ${formatNumber(needed)}` : appText('outOfStock')}</span>`;
            lowStockList.appendChild(row);
        });
        if (shortages.length > 5) {
            const more = document.createElement('p');
            more.className = 'overview-more-link';
            more.textContent = appLanguage === 'en'
                ? `+ ${shortages.length - 5} more items`
                : `+ ${shortages.length - 5} vật tư khác`;
            lowStockList.appendChild(more);
        }
    }

    const historyList = document.getElementById('overviewRecentTransactions');
    if (historyList) {
        historyList.replaceChildren();
        if (!historyLogs.length) {
            historyList.innerHTML = `<p class="overview-empty-state"><i class="fa-regular fa-clock" aria-hidden="true"></i>${appText('noTransactions')}</p>`;
        }
        historyLogs.slice(0, 4).forEach(log => {
            const row = document.createElement('div');
            row.className = 'overview-transaction-row';
            const isIncoming = log.type === 'IN';
            const project = log.project || (appLanguage === 'en' ? 'Shared stock' : 'Kho dùng chung');
            row.innerHTML = `<span class="overview-transaction-icon ${isIncoming ? 'is-in' : 'is-out'}"><i class="fa-solid ${isIncoming ? 'fa-arrow-down' : 'fa-arrow-up'}" aria-hidden="true"></i></span>
                <span class="overview-row-main"><strong>${escapeHtml(log.name)}</strong><small>${escapeHtml(project)} · ${escapeHtml(log.timestamp || '')}</small></span>
                <span class="overview-transaction-qty ${isIncoming ? 'is-in' : 'is-out'}">${isIncoming ? '+' : '−'}${formatNumber(log.qty)}</span>`;
            historyList.appendChild(row);
        });
    }
    renderDashboardAnalytics();
    renderTopbarNotifications();
}

function setDashboardRange(days) {
    const range = Number(days);
    if (![7, 30, 90].includes(range)) return;
    renderDashboardAnalytics();
}

function setDashboardPeriod(period) {
    if (period !== 'daily' && period !== 'weekly') return;
    dashboardChartPeriod = period;
    document.querySelectorAll('[data-dashboard-period]').forEach(button => {
        button.classList.toggle('is-active', button.dataset.dashboardPeriod === period);
        button.setAttribute('aria-pressed', String(button.dataset.dashboardPeriod === period));
    });
    renderDashboardAnalytics();
}

function getHistoryLogDate(log) {
    const rawDate = String(log.timestamp || '');
    const isoDate = rawDate.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (isoDate) return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;
    const localizedDate = rawDate.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (!localizedDate) return '';
    return `${localizedDate[3]}-${localizedDate[2].padStart(2, '0')}-${localizedDate[1].padStart(2, '0')}`;
}

function renderDashboardAnalytics() {
    const chart = document.getElementById('dashboardPerformanceChart');
    if (!chart) return;
    const tooltip = document.getElementById('dashboardChartTooltip');
    const selectedRange = Number(document.getElementById('dashboardRange')?.value) || 7;
    const bucketCount = dashboardChartPeriod === 'weekly'
        ? Math.max(1, Math.ceil(selectedRange / 7))
        : selectedRange;
    const visibleBucketCount = bucketCount;
    const today = new Date();
    const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (bucketCount - 1) * (dashboardChartPeriod === 'weekly' ? 7 : 1));
    const buckets = Array.from({ length: visibleBucketCount }, (_, index) => {
        const date = new Date(startDate);
        date.setDate(date.getDate() + index * (dashboardChartPeriod === 'weekly' ? 7 : 1));
        return { date, incoming: 0, outgoing: 0 };
    });

    historyLogs.forEach(log => {
        const dateValue = getHistoryLogDate(log);
        if (!dateValue) return;
        const [year, month, day] = dateValue.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        const offset = Math.floor((endDate - date) / 86400000);
        if (offset < 0 || offset >= bucketCount) return;
        const index = dashboardChartPeriod === 'weekly'
            ? Math.min(visibleBucketCount - 1, visibleBucketCount - 1 - Math.floor(offset / 7))
            : visibleBucketCount - 1 - offset;
        if (index < 0 || index >= buckets.length) return;
        if (log.type === 'IN') buckets[index].incoming += Math.max(0, Number(log.qty) || 0);
        else if (log.type === 'OUT') buckets[index].outgoing += Math.max(0, Number(log.qty) || 0);
    });

    const width = 760;
    const height = 258;
    const left = 43;
    const right = 14;
    const top = 17;
    const bottom = 31;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const maxValue = Math.max(1, ...buckets.flatMap(bucket => [bucket.incoming, bucket.outgoing]));
    const scaleMax = Math.ceil(maxValue / 10) * 10 || 1;
    const xAt = index => left + (buckets.length > 1 ? index / (buckets.length - 1) : 0.5) * plotWidth;
    const yAt = value => top + plotHeight - value / scaleMax * plotHeight;
    const pathFor = key => buckets.map((bucket, index) =>
        `${index ? 'L' : 'M'}${xAt(index).toFixed(1)},${yAt(bucket[key]).toFixed(1)}`
    ).join(' ');
    const incomingPath = pathFor('incoming');
    const outgoingPath = pathFor('outgoing');
    const areaFor = path => `${path} L${xAt(buckets.length - 1).toFixed(1)},${(top + plotHeight).toFixed(1)} L${left},${(top + plotHeight).toFixed(1)} Z`;
    const gridLines = Array.from({ length: 5 }, (_, index) => {
        const value = scaleMax - scaleMax * index / 4;
        const y = top + plotHeight * index / 4;
        return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" class="dashboard-chart-gridline"/><text x="${left - 9}" y="${y + 3}" text-anchor="end" class="dashboard-chart-axis-label">${formatNumber(Math.round(value))}</text>`;
    }).join('');
    const labelStep = Math.max(1, Math.ceil(buckets.length / 7));
    const xLabels = buckets.map((bucket, index) => {
        if (index % labelStep !== 0 && index !== buckets.length - 1) return '';
        const label = bucket.date.toLocaleDateString(appLanguage === 'en' ? 'en-US' : 'vi-VN', {
            day: 'numeric',
            month: dashboardChartPeriod === 'weekly' ? 'short' : undefined
        });
        return `<text x="${xAt(index)}" y="${height - 7}" text-anchor="middle" class="dashboard-chart-axis-label">${label}</text>`;
    }).join('');
    const points = buckets.map((bucket, index) => {
        const label = bucket.date.toLocaleDateString(appLanguage === 'en' ? 'en-US' : 'vi-VN', { day: 'numeric', month: 'long' });
        return `<circle class="dashboard-chart-point is-in" cx="${xAt(index)}" cy="${yAt(bucket.incoming)}" r="4" data-label="${escapeHtml(label)}" data-value="${formatNumber(bucket.incoming)}" data-series="${escapeHtml(appText('stockIn'))}"/><circle class="dashboard-chart-point is-out" cx="${xAt(index)}" cy="${yAt(bucket.outgoing)}" r="4" data-label="${escapeHtml(label)}" data-value="${formatNumber(bucket.outgoing)}" data-series="${escapeHtml(appText('stockOut'))}"/>`;
    }).join('');
    chart.innerHTML = `<svg class="dashboard-performance-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="stockInArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#42b9b2" stop-opacity=".22"/><stop offset="100%" stop-color="#42b9b2" stop-opacity="0"/></linearGradient><linearGradient id="stockOutArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#82a6dc" stop-opacity=".16"/><stop offset="100%" stop-color="#82a6dc" stop-opacity="0"/></linearGradient></defs>
        ${gridLines}<path class="dashboard-chart-area is-in" d="${areaFor(incomingPath)}"/><path class="dashboard-chart-area is-out" d="${areaFor(outgoingPath)}"/><path class="dashboard-chart-line is-in" d="${incomingPath}"/><path class="dashboard-chart-line is-out" d="${outgoingPath}"/>${points}${xLabels}
    </svg>${tooltip ? tooltip.outerHTML : '<div class="dashboard-chart-tooltip hidden" id="dashboardChartTooltip"></div>'}`;
    const chartTooltip = document.getElementById('dashboardChartTooltip');
    chart.querySelectorAll('.dashboard-chart-point').forEach(point => {
        const showTooltip = event => {
            if (!chartTooltip) return;
            chartTooltip.textContent = `${point.dataset.label} · ${point.dataset.series}: ${point.dataset.value}`;
            chartTooltip.classList.remove('hidden');
            const bounds = chart.getBoundingClientRect();
            chartTooltip.style.left = `${Math.min(bounds.width - 190, Math.max(4, event.clientX - bounds.left + 10))}px`;
            chartTooltip.style.top = `${Math.max(0, event.clientY - bounds.top - 38)}px`;
        };
        point.addEventListener('pointerenter', showTooltip);
        point.addEventListener('pointermove', showTooltip);
        point.addEventListener('pointerleave', () => chartTooltip?.classList.add('hidden'));
    });

    renderDashboardCategoryDistribution();
    renderDashboardRecentTransactions();
}

function renderDashboardCategoryDistribution() {
    const donut = document.getElementById('dashboardCategoryDonut');
    const legend = document.getElementById('dashboardCategoryLegend');
    if (!donut || !legend) return;
    const categories = ['passive', 'sensor', 'board', 'chip', 'other', 'tool'];
    const distribution = categories.map(category => ({
        category,
        quantity: inventoryData.filter(item => getMaterialCategory(item) === category)
            .reduce((sum, item) => sum + Math.max(0, Number(item.qty) || 0), 0)
    }));
    const total = distribution.reduce((sum, item) => sum + item.quantity, 0);
    const colors = ['#42b9b2', '#829bd0', '#69b795', '#d5a65d', '#738397', '#d27f89'];
    let start = 0;
    const segments = distribution.map((item, index) => {
        const end = start + (total ? item.quantity / total * 100 : 0);
        const segment = `${colors[index]} ${start}% ${end}%`;
        start = end;
        return segment;
    });
    donut.style.background = total
        ? `conic-gradient(${segments.join(', ')})`
        : 'conic-gradient(#273143 0% 100%)';
    const totalLabel = document.getElementById('dashboardCategoryTotal');
    if (totalLabel) totalLabel.textContent = formatNumber(total);
    legend.replaceChildren();
    distribution.filter(item => item.quantity > 0).forEach(item => {
        const index = categories.indexOf(item.category);
        const row = document.createElement('div');
        row.className = 'dashboard-category-item';
        row.innerHTML = `<span><i style="--category-color:${colors[index]}"></i>${escapeHtml(getMaterialCategoryLabel(item.category))}</span><strong>${formatNumber(item.quantity)}</strong><small>${total ? Math.round(item.quantity / total * 100) : 0}%</small>`;
        legend.appendChild(row);
    });
    if (!total) {
        legend.innerHTML = `<p class="dashboard-empty-state">${appLanguage === 'en' ? 'No stock data available.' : 'Chưa có dữ liệu tồn kho.'}</p>`;
    }
}

function renderDashboardRecentTransactions() {
    const table = document.getElementById('overviewTransactionTable');
    if (!table) return;
    table.replaceChildren();
    if (!historyLogs.length) {
        table.innerHTML = `<tr><td colspan="6" class="dashboard-table-empty">${appText('noTransactions')}</td></tr>`;
        return;
    }
    historyLogs.slice(0, 6).forEach(log => {
        const row = document.createElement('tr');
        const isIncoming = log.type === 'IN';
        const project = log.project || (appLanguage === 'en' ? 'Shared stock' : 'Kho dùng chung');
        const rowAction = log.receiptNo
            ? `openSavedTransactionReceipt('${escapeHtml(String(log.receiptNo))}')`
            : "switchTab('history')";
        row.innerHTML = `<td><span class="dashboard-transaction-name">${escapeHtml(log.name)}</span><small>${escapeHtml(log.user || (appLanguage === 'en' ? 'System' : 'Hệ thống'))}</small></td>
            <td><span class="dashboard-status-badge ${isIncoming ? 'is-in' : 'is-out'}"><i class="fa-solid ${isIncoming ? 'fa-arrow-down' : 'fa-arrow-up'}" aria-hidden="true"></i>${escapeHtml(appText(isIncoming ? 'stockIn' : 'stockOut'))}</span></td>
            <td>${escapeHtml(project)}</td><td class="${isIncoming ? 'dashboard-quantity-in' : 'dashboard-quantity-out'}">${isIncoming ? '+' : '−'}${formatNumber(log.qty)}</td>
            <td>${escapeHtml(log.timestamp || '')}</td>
            <td><button type="button" class="dashboard-row-action" onclick="${rowAction}" aria-label="${appLanguage === 'en' ? 'View transaction details' : 'Xem chi tiết giao dịch'}"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></button></td>`;
        table.appendChild(row);
    });
}

function handleGlobalDashboardSearch(event) {
    if (event.key !== 'Enter') return;
    const search = document.getElementById('globalDashboardSearch')?.value.trim() || '';
    if (!search) return;
    const normalizedSearch = search.toLocaleLowerCase(appLanguage === 'en' ? 'en' : 'vi');
    const material = inventoryData.find(item => String(item.name || '').toLocaleLowerCase('vi').includes(normalizedSearch));
    if (material) {
        switchTab('inventory');
        document.getElementById('inventorySearchInput').value = search;
        renderInventory();
        return;
    }
    const product = bomProducts.find(item => String(item.name || '').toLocaleLowerCase('vi').includes(normalizedSearch));
    if (product) {
        switchTab('bom');
        return;
    }
    const project = workspaceProjects.find(item => String(item.name || '').toLocaleLowerCase('vi').includes(normalizedSearch));
    if (project) {
        switchTab('projects');
        showWorkspaceProjectCatalog();
        document.getElementById('workspaceProjectSearch').value = search;
        searchWorkspaceProjects();
        return;
    }
    notifyFailure(appText('noSearchResults'));
}

// ================= THÔNG BÁO TỒN KHO VÀ LỊCH TRÌNH =================
function renderTopbarNotifications() {
    const list = document.getElementById('notificationList');
    if (!list) return;
    const shortages = notificationPreferences.lowStock ? getInventoryShortages() : [];
    const today = localDateString(new Date());
    const plans = notificationPreferences.schedule
        ? workspacePlans.filter(plan => plan.date === today)
        : [];
    const count = shortages.length + plans.length;
    const badge = document.getElementById('notificationCount');
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.toggle('hidden', count === 0);
    document.getElementById('notificationPopoverSummary').textContent = count
        ? `${formatNumber(count)} ${appLanguage === 'en' ? 'updates' : 'cập nhật'}`
        : '';
    list.replaceChildren();
    if (!count) {
        list.innerHTML = `<p class="topbar-notification-empty">${appLanguage === 'en' ? 'You’re all caught up.' : 'Bạn đã xem hết thông báo.'}</p>`;
        return;
    }
    shortages.slice(0, 4).forEach(({ item, needed }) => {
        const row = document.createElement('div');
        row.className = 'topbar-notification-item';
        row.innerHTML = `<span class="topbar-notification-dot is-rose"><i class="fa-solid fa-box-open" aria-hidden="true"></i></span>
            <span><strong>${escapeHtml(item.name)}</strong><small>${needed ? `${appText('itemNeeded')} ${formatNumber(needed)}` : appText('outOfStock')}</small></span>`;
        list.appendChild(row);
    });
    if (plans.length) {
        const row = document.createElement('div');
        row.className = 'topbar-notification-item';
        row.innerHTML = `<span class="topbar-notification-dot is-blue"><i class="fa-solid fa-calendar-check" aria-hidden="true"></i></span>
            <span><strong>${formatNumber(plans.length)} ${appLanguage === 'en' ? 'tasks scheduled today' : 'công việc hôm nay'}</strong><small>${appLanguage === 'en' ? 'Open the dashboard to review your schedule.' : 'Mở Tổng quan để xem lịch trình.'}</small></span>`;
        list.appendChild(row);
    }
}

// ================= TAB HƯỚNG DẪN: QUY TRÌNH VÀ CÁC BƯỚC =================
function renderGuideWorkflow() {
    const list = document.getElementById('guideWorkflowSteps');
    if (!list) return;
    list.replaceChildren();
    const completed = guideSteps.filter(step => step.done).length;
    const progress = guideSteps.length ? Math.round(completed / guideSteps.length * 100) : 0;
    document.getElementById('guideProgressLabel').textContent = `${formatNumber(completed)} / ${formatNumber(guideSteps.length)} ${appLanguage === 'en' ? 'steps' : 'bước'}`;
    document.getElementById('guideProgressBar').style.width = `${progress}%`;
    guideSteps.forEach((step, index) => {
        const row = document.createElement('li');
        row.className = `guide-step${step.done ? ' is-done' : ''}`;
        const title = appLanguage === 'en' ? step.en || step.vi : step.vi || step.en;
        row.innerHTML = `<span class="guide-step-number">${String(index + 1).padStart(2, '0')}</span>
            <span class="guide-step-check"><input type="checkbox" ${step.done ? 'checked' : ''} aria-label="${appLanguage === 'en' ? 'Mark complete' : 'Đánh dấu hoàn thành'}"></span>
            <span class="guide-step-copy"><strong>${escapeHtml(title)}</strong><small>${appLanguage === 'en' ? `Step ${index + 1} of ${guideSteps.length}` : `Bước ${index + 1} / ${guideSteps.length}`}</small></span>
            ${step.custom ? `<button type="button" class="guide-step-delete" aria-label="${appLanguage === 'en' ? 'Remove step' : 'Xóa bước'}"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button>` : ''}`;
        row.querySelector('input').addEventListener('change', event => updateGuideStep(step.id, event.target.checked));
        row.querySelector('.guide-step-delete')?.addEventListener('click', () => removeGuideStep(step.id));
        list.appendChild(row);
    });
}

function updateGuideStep(stepId, done) {
    guideSteps = guideSteps.map(step => step.id === stepId ? { ...step, done } : step);
    persistToLocalStorage(STORAGE_KEY_GUIDE_STEPS, JSON.stringify(guideSteps));
    renderGuideWorkflow();
}

function addGuideStep(event) {
    event.preventDefault();
    const input = document.getElementById('guideStepTitle');
    const title = input.value.trim();
    if (!title) {
        notifyFailure(appLanguage === 'en' ? 'Enter a step name before adding it.' : 'Vui lòng nhập tên bước trước khi thêm.');
        input.focus();
        return;
    }
    guideSteps.push({ id: `custom-${Date.now()}`, vi: title, en: title, done: false, custom: true });
    persistToLocalStorage(STORAGE_KEY_GUIDE_STEPS, JSON.stringify(guideSteps));
    event.target.reset();
    renderGuideWorkflow();
    notifySuccess(appLanguage === 'en' ? 'Workflow step added.' : 'Đã thêm bước vào quy trình.');
}

function removeGuideStep(stepId) {
    guideSteps = guideSteps.filter(step => step.id !== stepId);
    persistToLocalStorage(STORAGE_KEY_GUIDE_STEPS, JSON.stringify(guideSteps));
    renderGuideWorkflow();
}

function setTodoFilter(filter) {
    if (!['all', 'todo', 'doing', 'done'].includes(filter)) return;
    activeTodoFilter = filter;
    document.querySelectorAll('[data-todo-filter]').forEach(button => {
        button.classList.toggle('is-active', button.dataset.todoFilter === filter);
    });
    renderSharedWorkspace();
}

// ================= TAB CÔNG VIỆC: THÀNH VIÊN VÀ NGƯỜI PHỤ TRÁCH =================
function normalizeWorkspaceMemberNames(names) {
    if (!Array.isArray(names)) return [];
    const uniqueNames = new Map();
    names.forEach(name => {
        if (typeof name !== 'string') return;
        const normalized = name.trim();
        if (normalized && !uniqueNames.has(normalized.toLocaleLowerCase())) {
            uniqueNames.set(normalized.toLocaleLowerCase(), normalized);
        }
    });
    return [...uniqueNames.values()];
}

function saveWorkspaceMembers() {
    workspaceMembers = normalizeWorkspaceMemberNames(workspaceMembers);
    persistToLocalStorage(STORAGE_KEY_WORKSPACE_MEMBERS, JSON.stringify(workspaceMembers));
}

function renderTodoAssigneeDirectory() {
    const directory = document.getElementById('todoAssigneeDirectory');
    if (!directory) return;
    if (!workspaceMembers.length) {
        directory.innerHTML = `<p class="todo-assignee-empty">${escapeHtml(appText('noTeamMembers'))}</p>`;
        return;
    }
    directory.innerHTML = workspaceMembers.map(name => {
        const initials = name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toLocaleUpperCase();
        const checked = todoSelectedAssignees.has(name) ? ' checked' : '';
        return `<label class="todo-assignee-option"><input type="checkbox" data-todo-assignee="${escapeHtml(name)}"${checked}><span class="todo-assignee-avatar">${escapeHtml(initials)}</span><span class="todo-assignee-name">${escapeHtml(name)}</span><i class="fa-solid fa-check todo-assignee-selected" aria-hidden="true"></i></label>`;
    }).join('');
    directory.querySelectorAll('[data-todo-assignee]').forEach(input => input.addEventListener('change', () => {
        const name = input.dataset.todoAssignee;
        if (input.checked) todoSelectedAssignees.add(name);
        else todoSelectedAssignees.delete(name);
    }));
}

function addTodoAssigneeFromInput() {
    const input = document.getElementById('todoAssigneeInput');
    const name = input.value.trim();
    if (!name) {
        notifyFailure(appText('missingTeamMemberName'));
        input.focus();
        return;
    }
    const existingName = workspaceMembers.find(member => member.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existingName) {
        todoSelectedAssignees.add(existingName);
        notifySuccess(appText('existingTeamMember'));
    } else {
        workspaceMembers.push(name);
        saveWorkspaceMembers();
        todoSelectedAssignees.add(name);
        notifySuccess(appText('newTeamMemberAdded'));
    }
    input.value = '';
    renderTodoAssigneeDirectory();
}

function renderTodoAssigneeBadges(assignees) {
    const names = normalizeWorkspaceMemberNames(assignees);
    if (!names.length) return `<span class="todo-assignee-unassigned"><i class="fa-regular fa-user" aria-hidden="true"></i>${escapeHtml(appText('unassigned'))}</span>`;
    return `<span class="todo-assignee-badges">${names.map(name => {
        const initials = name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toLocaleUpperCase();
        return `<span class="todo-assignee-badge" title="${escapeHtml(name)}"><span class="todo-assignee-avatar">${escapeHtml(initials)}</span>${escapeHtml(name)}</span>`;
    }).join('')}</span>`;
}

function isActiveTodoAssigneeEditor(kind, id, taskId = '') {
    return activeTodoAssigneeEditor?.kind === kind &&
        String(activeTodoAssigneeEditor.id) === String(id) &&
        String(activeTodoAssigneeEditor.taskId || '') === String(taskId);
}

function renderInlineTodoAssigneeEditor(kind, id, taskId) {
    if (!isActiveTodoAssigneeEditor(kind, id, taskId)) return '';
    const options = workspaceMembers.map(name => {
        const initials = name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toLocaleUpperCase();
        const checked = todoAssigneeDraft.has(name) ? ' checked' : '';
        return `<label class="todo-inline-assignee-option"><input type="checkbox" data-inline-assignee="${escapeHtml(name)}"${checked}><span class="todo-assignee-avatar">${escapeHtml(initials)}</span><span>${escapeHtml(name)}</span></label>`;
    }).join('');
    return `<div class="todo-inline-assignee-editor">
        <div class="todo-inline-assignee-heading"><strong>${escapeHtml(appText('assignees'))}</strong><span>${escapeHtml(appText('selectTaskAssignees'))}</span></div>
        <div class="todo-inline-assignee-options">${options || `<span class="todo-assignee-empty">${escapeHtml(appText('noTeamMembers'))}</span>`}</div>
        <div class="todo-inline-assignee-actions"><div class="todo-inline-add-member"><input type="text" maxlength="80" data-inline-new-member placeholder="${escapeHtml(appText('enterTeamMember'))}" aria-label="${escapeHtml(appText('enterTeamMember'))}"><button type="button" data-inline-add-member="${escapeHtml(kind)}" data-item-id="${escapeHtml(String(id))}" data-task-id="${escapeHtml(String(taskId))}" title="${escapeHtml(appText('addPerson'))}" aria-label="${escapeHtml(appText('addPerson'))}"><i class="fi fi-rs-plus" aria-hidden="true"></i></button></div>
        <div><button type="button" class="todo-inline-cancel" data-assignee-cancel>${escapeHtml(appText('cancel'))}</button><button type="button" class="todo-inline-save" data-assignee-save="${escapeHtml(kind)}" data-item-id="${escapeHtml(String(id))}" data-task-id="${escapeHtml(String(taskId))}">${escapeHtml(appText('saveAssignees'))}</button></div></div>
    </div>`;
}

function openTodoAssigneeEditor(kind, id, taskId = '') {
    let assignees = [];
    if (kind === 'shared') {
        assignees = sharedTodos.find(todo => String(todo.id) === String(id))?.assignees || [];
    } else {
        const project = workspaceProjects.find(item => String(item.id) === String(id));
        assignees = project?.tasks.find(task => String(task.id) === String(taskId))?.assignees || [];
    }
    const selected = normalizeWorkspaceMemberNames(assignees);
    workspaceMembers = normalizeWorkspaceMemberNames([...workspaceMembers, ...selected]);
    saveWorkspaceMembers();
    activeTodoAssigneeEditor = { kind, id, taskId };
    todoAssigneeDraft = new Set(selected);
    renderSharedWorkspace();
}

function addTodoAssigneeInline(kind, id, taskId = '') {
    const editor = document.querySelector('.todo-inline-assignee-editor');
    const input = editor?.querySelector('[data-inline-new-member]');
    if (!input) return;
    const name = input.value.trim();
    if (!name) {
        notifyFailure(appText('missingTeamMemberName'));
        input.focus();
        return;
    }
    const existingName = workspaceMembers.find(member => member.toLocaleLowerCase() === name.toLocaleLowerCase());
    const memberName = existingName || name;
    if (!existingName) {
        workspaceMembers.push(memberName);
        saveWorkspaceMembers();
    }
    todoAssigneeDraft.add(memberName);
    activeTodoAssigneeEditor = { kind, id, taskId };
    input.value = '';
    renderSharedWorkspace();
}

async function saveTodoAssigneeChanges(kind, id, taskId = '') {
    const assignees = [...todoAssigneeDraft];
    try {
        if (kind === 'shared') {
            const todo = sharedTodos.find(item => String(item.id) === String(id));
            if (!todo) throw new Error('Không tìm thấy công việc cần cập nhật.');
            await apiRequest(`/api/todos/${encodeURIComponent(String(id))}`, {
                method: 'PUT',
                body: JSON.stringify({ ...todo, assignees })
            });
            activeTodoAssigneeEditor = null;
            todoAssigneeDraft.clear();
            if (await refreshSharedWorkspaceData()) notifySuccess('Đã cập nhật người phụ trách.');
            return;
        }

        const project = workspaceProjects.find(item => String(item.id) === String(id));
        const task = project?.tasks.find(item => String(item.id) === String(taskId));
        if (!project || !task) throw new Error('Không tìm thấy công việc thuộc dự án cần cập nhật.');
        task.assignees = assignees;
        saveWorkspaceState();
        activeTodoAssigneeEditor = null;
        todoAssigneeDraft.clear();
        renderWorkspaceDashboard();
        renderSharedWorkspace();
        notifySuccess('Đã cập nhật người phụ trách.');
    } catch (error) {
        notifyFailure(`Không cập nhật được người phụ trách: ${error.message}`);
    }
}

// ================= TAB CÔNG VIỆC: DANH SÁCH VIỆC VÀ GHI CHÚ DÙNG CHUNG =================
function renderSharedWorkspace() {
    const taskList = document.getElementById('sharedTodoList');
    const notesList = document.getElementById('sharedNotesList');
    if (!taskList || !notesList) return;
    const search = document.getElementById('todoSearchInput')?.value.trim().toLocaleLowerCase() || '';
    const selectedDate = workspaceDashboardDate || localDateString(new Date());
    const scheduledTasks = workspacePlans
        .filter(plan => plan.date === selectedDate)
        .map(plan => {
            const project = workspaceProjects.find(item => String(item.id) === String(plan.projectId));
            const task = project?.tasks.find(item => String(item.id) === String(plan.taskId));
            return project && task ? { plan, project, task, progress: getWorkspaceTaskProgressForPlan(plan, task) } : null;
        })
        .filter(item => item !== null);
    const filteredTodos = sharedTodos.filter(todo => {
        const matchesStatus = activeTodoFilter === 'all' || todo.status === activeTodoFilter;
        const searchable = `${todo.title} ${todo.description} ${todo.tags}`.toLocaleLowerCase();
        return matchesStatus && (!search || searchable.includes(search));
    });
    const filteredProjectTasks = scheduledTasks.filter(({ plan, project, task, progress }) => {
        const status = progress.remainingToday === 0 ? 'done' : progress.completedToday > 0 ? 'doing' : 'todo';
        const matchesStatus = activeTodoFilter === 'all' || status === activeTodoFilter;
        const searchable = `${task.title} ${task.note || ''} ${project.name}`.toLocaleLowerCase();
        return matchesStatus && (!search || searchable.includes(search));
    });
    const filtered = [
        ...filteredProjectTasks.map(item => ({ kind: 'project', ...item })),
        ...filteredTodos.map(todo => ({ kind: 'shared', todo }))
    ];
    document.getElementById('todoCountLabel').textContent =
        `${sharedTodos.length + scheduledTasks.length} ${appLanguage === 'en' ? 'tasks' : 'công việc'}`;
    if (!filtered.length) {
        taskList.innerHTML = `<p class="notion-empty-state"><i class="fa-regular fa-circle-check" aria-hidden="true"></i>${search || activeTodoFilter !== 'all' ? 'Không tìm thấy công việc phù hợp.' : 'Chưa có công việc. Tạo mục đầu tiên cho nhóm.'}</p>`;
    } else {
        taskList.innerHTML = filtered.map(item => {
            if (item.kind === 'project') {
                const { plan, project, task, progress } = item;
                const isComplete = progress.remainingToday === 0;
                const status = isComplete ? 'done' : progress.completedToday > 0 ? 'doing' : 'todo';
                const statusLabel = { todo: 'Chưa làm', doing: 'Đang làm', done: 'Hoàn tất' }[status];
                const priority = (task.priority || 'Bình thường').trim().toLocaleLowerCase('vi');
                const priorityKey = ['gấp', 'quan trọng'].includes(priority) ? 'high' : priority === 'dễ' ? 'low' : 'medium';
                const priorityLabel = { low: 'Thấp', medium: 'Bình thường', high: 'Cao' }[priorityKey];
                const time = getWorkspacePlanTime(plan, task);
                const taskDetails = `${project.name} · ${time || 'Chưa đặt giờ'} · Hôm nay ${formatNumber(progress.completedToday)}/${formatNumber(progress.targetQuantity)}`;
                return `<article class="notion-task-row notion-project-task-row${isComplete ? ' is-complete' : ''}">
                    <button type="button" class="notion-task-check${isComplete ? ' is-checked' : ''}" data-project-plan-toggle="${escapeHtml(String(plan.id))}" aria-label="${isComplete ? 'Điều chỉnh tiến độ' : 'Cập nhật tiến độ'}"><i class="fa-solid fa-check" aria-hidden="true"></i></button>
                    <div class="notion-task-main"><button type="button" class="notion-task-title" data-project-edit="${escapeHtml(String(project.id))}">${escapeHtml(task.title)}</button>${task.note ? `<p>${escapeHtml(task.note)}</p>` : ''}<div class="notion-task-meta"><span class="notion-property is-${status}"><i class="fa-solid fa-circle" aria-hidden="true"></i>${statusLabel}</span><span class="notion-property is-priority-${priorityKey}"><i class="fa-solid fa-flag" aria-hidden="true"></i>${priorityLabel}</span><span class="notion-tag">${escapeHtml(project.name)}</span><span class="notion-property"><i class="fa-regular fa-clock" aria-hidden="true"></i>${escapeHtml(time || 'Chưa đặt giờ')}</span><span class="notion-property notion-task-quantity">${escapeHtml(taskDetails.replace(`${project.name} · ${time || 'Chưa đặt giờ'} · `, ''))}</span>${renderTodoAssigneeBadges(task.assignees)}</div>${renderInlineTodoAssigneeEditor('project', project.id, task.id)}</div>
                    <div class="notion-task-actions"><button type="button" class="notion-icon-action" data-toggle-assignees="project" data-item-id="${escapeHtml(String(project.id))}" data-task-id="${escapeHtml(String(task.id))}" aria-label="${escapeHtml(appText('editAssignees'))}" title="${escapeHtml(appText('editAssignees'))}"><i class="fa-solid fa-user-pen" aria-hidden="true"></i></button><button type="button" class="notion-icon-action" data-project-edit="${escapeHtml(String(project.id))}" aria-label="Mở dự án" title="Mở dự án"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></button></div>
                </article>`;
            }
            const todo = item.todo;
            const due = todo.due_date ? new Date(`${todo.due_date}T00:00:00`).toLocaleDateString(appLanguage === 'en' ? 'en-US' : 'vi-VN') : '';
            const statusLabel = { todo: 'Chưa làm', doing: 'Đang làm', done: 'Hoàn tất' }[todo.status] || 'Chưa làm';
            const priorityLabel = { low: 'Thấp', medium: 'Bình thường', high: 'Cao' }[todo.priority] || 'Bình thường';
            return `<article class="notion-task-row${todo.status === 'done' ? ' is-complete' : ''}">
                <button type="button" class="notion-task-check${todo.status === 'done' ? ' is-checked' : ''}" data-todo-toggle="${todo.id}" aria-label="${todo.status === 'done' ? 'Đánh dấu chưa hoàn tất' : 'Đánh dấu hoàn tất'}"><i class="fa-solid fa-check" aria-hidden="true"></i></button>
                <div class="notion-task-main"><button type="button" class="notion-task-title" data-todo-edit="${todo.id}">${escapeHtml(todo.title)}</button>${todo.description ? `<p>${escapeHtml(todo.description)}</p>` : ''}<div class="notion-task-meta"><span class="notion-property is-${escapeHtml(todo.status)}"><i class="fa-solid fa-circle" aria-hidden="true"></i>${statusLabel}</span><span class="notion-property is-priority-${escapeHtml(todo.priority)}"><i class="fa-solid fa-flag" aria-hidden="true"></i>${priorityLabel}</span>${due ? `<span class="notion-property"><i class="fa-regular fa-calendar" aria-hidden="true"></i>${escapeHtml(due)}</span>` : ''}${todo.tags ? `<span class="notion-tag">${escapeHtml(todo.tags)}</span>` : ''}${renderTodoAssigneeBadges(todo.assignees)}</div>${renderInlineTodoAssigneeEditor('shared', todo.id, '')}</div>
                <div class="notion-task-actions"><button type="button" class="notion-icon-action" data-toggle-assignees="shared" data-item-id="${escapeHtml(String(todo.id))}" aria-label="${escapeHtml(appText('editAssignees'))}" title="${escapeHtml(appText('editAssignees'))}"><i class="fa-solid fa-user-pen" aria-hidden="true"></i></button><button type="button" class="notion-icon-action" data-todo-edit="${todo.id}" aria-label="Chỉnh sửa" title="Chỉnh sửa"><i class="fa-solid fa-pen" aria-hidden="true"></i></button><button type="button" class="notion-icon-action is-danger" data-todo-delete="${todo.id}" aria-label="Xóa" title="Xóa"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button></div>
            </article>`;
        }).join('');
    }
    taskList.querySelectorAll('[data-todo-toggle]').forEach(button => button.addEventListener('click', () => toggleSharedTodo(button.dataset.todoToggle)));
    taskList.querySelectorAll('[data-todo-edit]').forEach(button => button.addEventListener('click', () => openTodoEditor(button.dataset.todoEdit)));
    taskList.querySelectorAll('[data-todo-delete]').forEach(button => button.addEventListener('click', () => deleteSharedTodo(button.dataset.todoDelete)));
    taskList.querySelectorAll('[data-project-plan-toggle]').forEach(button => button.addEventListener('click', () => toggleWorkspaceTask(button.dataset.projectPlanToggle)));
    taskList.querySelectorAll('[data-project-edit]').forEach(button => button.addEventListener('click', () => {
        switchTab('projects');
        showWorkspaceProjectCatalog();
        openWorkspaceProjectEditor(button.dataset.projectEdit);
    }));
    taskList.querySelectorAll('[data-toggle-assignees]').forEach(button => button.addEventListener('click', () => {
        openTodoAssigneeEditor(button.dataset.toggleAssignees, button.dataset.itemId, button.dataset.taskId || '');
    }));
    taskList.querySelectorAll('[data-inline-assignee]').forEach(input => input.addEventListener('change', () => {
        const name = input.dataset.inlineAssignee;
        if (input.checked) todoAssigneeDraft.add(name);
        else todoAssigneeDraft.delete(name);
    }));
    taskList.querySelectorAll('[data-inline-add-member]').forEach(button => button.addEventListener('click', () => {
        addTodoAssigneeInline(button.dataset.inlineAddMember, button.dataset.itemId, button.dataset.taskId || '');
    }));
    taskList.querySelectorAll('[data-inline-new-member]').forEach(input => input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            const button = input.closest('.todo-inline-assignee-actions').querySelector('[data-inline-add-member]');
            addTodoAssigneeInline(button.dataset.inlineAddMember, button.dataset.itemId, button.dataset.taskId || '');
        }
    }));
    taskList.querySelectorAll('[data-assignee-save]').forEach(button => button.addEventListener('click', () => {
        void saveTodoAssigneeChanges(button.dataset.assigneeSave, button.dataset.itemId, button.dataset.taskId || '');
    }));
    taskList.querySelectorAll('[data-assignee-cancel]').forEach(button => button.addEventListener('click', () => {
        activeTodoAssigneeEditor = null;
        todoAssigneeDraft.clear();
        renderSharedWorkspace();
    }));

    document.getElementById('noteCountLabel').textContent =
        `${sharedNotes.length} ${appLanguage === 'en' ? 'pages' : 'trang'}`;
    if (!sharedNotes.length) {
        notesList.innerHTML = '<p class="notion-empty-state"><i class="fa-regular fa-note-sticky" aria-hidden="true"></i>Chưa có ghi chú. Tạo một trang để lưu thông tin cho nhóm.</p>';
    } else {
        notesList.innerHTML = sharedNotes.map(note => {
            const updated = note.updated_at ? new Date(`${note.updated_at.replace(' ', 'T')}Z`).toLocaleDateString(appLanguage === 'en' ? 'en-US' : 'vi-VN') : '';
            return `<article class="notion-note-card is-${escapeHtml(note.color)}" data-note-edit="${note.id}" tabindex="0" role="button" aria-label="Mở ghi chú ${escapeHtml(note.title)}"><div class="notion-note-card-top"><i class="fa-regular fa-file-lines" aria-hidden="true"></i><button type="button" class="notion-icon-action is-danger" data-note-delete="${note.id}" aria-label="Xóa ghi chú" title="Xóa ghi chú"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button></div><h5>${escapeHtml(note.title)}</h5><p>${escapeHtml(note.content || 'Trang ghi chú trống')}</p><small>${updated ? `Cập nhật ${escapeHtml(updated)}` : 'Vừa tạo'}</small></article>`;
        }).join('');
    }
    notesList.querySelectorAll('[data-note-edit]').forEach(card => {
        const edit = () => openNoteEditor(card.dataset.noteEdit);
        card.addEventListener('click', event => {
            if (!event.target.closest('[data-note-delete]')) edit();
        });
        card.addEventListener('keydown', event => {
            if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('[data-note-delete]')) {
                event.preventDefault();
                edit();
            }
        });
    });
    notesList.querySelectorAll('[data-note-delete]').forEach(button => button.addEventListener('click', event => {
        event.stopPropagation();
        deleteSharedNote(button.dataset.noteDelete);
    }));
}

// ================= TAB HƯỚNG DẪN: NỘI DUNG CHIA SẺ =================
function renderSharedGuideContent() {
    const list = document.getElementById('sharedGuideContentList');
    if (!list) return;
    if (!sharedGuideContent.length) {
        list.innerHTML = '<p class="notion-empty-state"><i class="fa-solid fa-book-open" aria-hidden="true"></i>Chưa có nội dung bổ sung. Thêm tài liệu đầu tiên cho nhóm.</p>';
        return;
    }
    const categories = { workflow: 'Quy trình', manual: 'Hướng dẫn sử dụng', troubleshooting: 'Lỗi & khắc phục' };
    list.innerHTML = sharedGuideContent.map(entry => `<article class="guide-library-card is-${escapeHtml(entry.category)}">
        <div class="guide-library-card-top"><span class="guide-library-category">${categories[entry.category] || 'Tài liệu'}</span><div><button type="button" class="notion-icon-action" data-guide-edit="${entry.id}" aria-label="Sửa nội dung"><i class="fa-solid fa-pen" aria-hidden="true"></i></button><button type="button" class="notion-icon-action is-danger" data-guide-delete="${entry.id}" aria-label="Xóa nội dung"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button></div></div>
        <h4>${escapeHtml(entry.title)}</h4>${entry.summary ? `<p class="guide-library-summary">${escapeHtml(entry.summary)}</p>` : ''}<div class="guide-library-body">${escapeHtml(entry.content)}</div>
    </article>`).join('');
    list.querySelectorAll('[data-guide-edit]').forEach(button => button.addEventListener('click', () => openGuideContentEditor(button.dataset.guideEdit)));
    list.querySelectorAll('[data-guide-delete]').forEach(button => button.addEventListener('click', () => deleteGuideContent(button.dataset.guideDelete)));
}

// ================= MODAL HƯỚNG DẪN, CÔNG VIỆC VÀ GHI CHÚ =================
function openWorkspaceEditor(id) {
    const modal = document.getElementById(id);
    modal.classList.remove('hidden');
    modal.querySelector('input:not([type="hidden"]), textarea')?.focus();
}

function closeWorkspaceEditor(id) {
    const modal = document.getElementById(id);
    modal.classList.add('hidden');
    const form = modal.matches('form') ? modal : modal.querySelector('form');
    form?.reset();
}

function openGuideContentEditor(id = '') {
    const entry = sharedGuideContent.find(item => String(item.id) === String(id));
    document.getElementById('guideContentEditorForm').reset();
    document.getElementById('guideContentId').value = entry ? String(entry.id) : '';
    document.getElementById('guideContentTitle').value = entry?.title || '';
    document.getElementById('guideContentCategory').value = entry?.category || 'workflow';
    document.getElementById('guideContentSummary').value = entry?.summary || '';
    document.getElementById('guideContentBody').value = entry?.content || '';
    document.getElementById('guideContentEditorTitle').textContent = entry ? 'Chỉnh sửa nội dung hướng dẫn' : 'Thêm nội dung hướng dẫn';
    openWorkspaceEditor('guideContentEditorModal');
}

async function saveGuideContent(event) {
    event.preventDefault();
    const id = document.getElementById('guideContentId').value;
    const content = {
        title: document.getElementById('guideContentTitle').value.trim(),
        category: document.getElementById('guideContentCategory').value,
        summary: document.getElementById('guideContentSummary').value.trim(),
        content: document.getElementById('guideContentBody').value.trim()
    };
    try {
        await apiRequest(id ? `/api/guide-content/${id}` : '/api/guide-content', {
            method: id ? 'PUT' : 'POST',
            body: JSON.stringify(content)
        });
        closeWorkspaceEditor('guideContentEditorModal');
        if (await refreshSharedWorkspaceData()) notifySuccess('Đã lưu nội dung hướng dẫn cho cả nhóm.');
    } catch (error) {
        notifyFailure(`Không lưu được nội dung hướng dẫn: ${error.message}`);
    }
}

async function deleteGuideContent(id) {
    if (!window.confirm('Xóa nội dung hướng dẫn này khỏi không gian dùng chung?')) return;
    try {
        await apiRequest(`/api/guide-content/${id}`, { method: 'DELETE' });
        if (await refreshSharedWorkspaceData()) notifySuccess('Đã xóa nội dung hướng dẫn.');
    } catch (error) {
        notifyFailure(`Không xóa được nội dung hướng dẫn: ${error.message}`);
    }
}

function openTodoEditor(id = '') {
    const todo = sharedTodos.find(item => String(item.id) === String(id));
    document.getElementById('todoEditorForm').reset();
    const savedAssignees = normalizeWorkspaceMemberNames(todo?.assignees);
    const memberCount = workspaceMembers.length;
    workspaceMembers = normalizeWorkspaceMemberNames([...workspaceMembers, ...savedAssignees]);
    if (workspaceMembers.length !== memberCount) saveWorkspaceMembers();
    todoSelectedAssignees = new Set(savedAssignees);
    document.getElementById('todoId').value = todo ? String(todo.id) : '';
    document.getElementById('todoTitle').value = todo?.title || '';
    document.getElementById('todoDescription').value = todo?.description || '';
    document.getElementById('todoStatus').value = todo?.status || 'todo';
    document.getElementById('todoPriority').value = todo?.priority || 'medium';
    document.getElementById('todoDueDate').value = todo?.due_date || '';
    document.getElementById('todoTags').value = todo?.tags || '';
    renderTodoAssigneeDirectory();
    document.getElementById('todoEditorTitle').textContent = todo ? 'Chỉnh sửa công việc' : 'Thêm công việc';
    openWorkspaceEditor('todoEditorModal');
}

async function saveTodo(event) {
    event.preventDefault();
    const id = document.getElementById('todoId').value;
    const existingTodo = sharedTodos.find(item => String(item.id) === String(id));
    const status = document.getElementById('todoStatus').value;
    const completedDate = status === 'done'
        ? existingTodo?.status === 'done'
            ? existingTodo.completed_date || localDateString(new Date())
            : localDateString(new Date())
        : '';
    const todo = {
        title: document.getElementById('todoTitle').value.trim(),
        description: document.getElementById('todoDescription').value.trim(),
        status,
        priority: document.getElementById('todoPriority').value,
        due_date: document.getElementById('todoDueDate').value,
        completed_date: completedDate,
        tags: document.getElementById('todoTags').value.trim(),
        assignees: [...todoSelectedAssignees]
    };
    try {
        await apiRequest(id ? `/api/todos/${id}` : '/api/todos', {
            method: id ? 'PUT' : 'POST',
            body: JSON.stringify(todo)
        });
        closeWorkspaceEditor('todoEditorModal');
        if (await refreshSharedWorkspaceData()) notifySuccess('Đã lưu công việc dùng chung.');
    } catch (error) {
        notifyFailure(`Không lưu được công việc: ${error.message}`);
    }
}

async function toggleSharedTodo(id) {
    const todo = sharedTodos.find(item => String(item.id) === String(id));
    if (!todo) return;
    const completing = todo.status !== 'done';
    try {
        await apiRequest(`/api/todos/${id}`, {
            method: 'PUT',
            body: JSON.stringify({
                ...todo,
                status: completing ? 'done' : 'todo',
                completed_date: completing ? localDateString(new Date()) : ''
            })
        });
        await refreshSharedWorkspaceData();
    } catch (error) {
        notifyFailure(`Không cập nhật được trạng thái công việc: ${error.message}`);
    }
}

async function deleteSharedTodo(id) {
    if (!window.confirm('Xóa công việc này khỏi danh sách dùng chung?')) return;
    try {
        await apiRequest(`/api/todos/${id}`, { method: 'DELETE' });
        if (await refreshSharedWorkspaceData()) notifySuccess('Đã xóa công việc.');
    } catch (error) {
        notifyFailure(`Không xóa được công việc: ${error.message}`);
    }
}

function openNoteEditor(id = '') {
    const note = sharedNotes.find(item => String(item.id) === String(id));
    document.getElementById('noteEditorForm').reset();
    document.getElementById('noteId').value = note ? String(note.id) : '';
    document.getElementById('noteTitle').value = note?.title || '';
    document.getElementById('noteContent').value = note?.content || '';
    document.getElementById('noteColor').value = note?.color || 'plain';
    document.getElementById('noteEditorTitle').textContent = note ? 'Chỉnh sửa ghi chú' : 'Tạo ghi chú';
    openWorkspaceEditor('noteEditorModal');
}

async function saveNote(event) {
    event.preventDefault();
    const id = document.getElementById('noteId').value;
    const note = {
        title: document.getElementById('noteTitle').value.trim(),
        content: document.getElementById('noteContent').value.trim(),
        color: document.getElementById('noteColor').value
    };
    try {
        await apiRequest(id ? `/api/notes/${id}` : '/api/notes', {
            method: id ? 'PUT' : 'POST',
            body: JSON.stringify(note)
        });
        closeWorkspaceEditor('noteEditorModal');
        if (await refreshSharedWorkspaceData()) notifySuccess('Đã lưu ghi chú dùng chung.');
    } catch (error) {
        notifyFailure(`Không lưu được ghi chú: ${error.message}`);
    }
}

async function deleteSharedNote(id) {
    if (!window.confirm('Xóa trang ghi chú này khỏi không gian dùng chung?')) return;
    try {
        await apiRequest(`/api/notes/${id}`, { method: 'DELETE' });
        if (await refreshSharedWorkspaceData()) notifySuccess('Đã xóa ghi chú.');
    } catch (error) {
        notifyFailure(`Không xóa được ghi chú: ${error.message}`);
    }
}

// ================= IN BÁO CÁO THỐNG KÊ =================
function printInventoryStatistics() {
    document.body.classList.add('printing-statistics');
    window.addEventListener('afterprint', () => document.body.classList.remove('printing-statistics'), { once: true });
    window.print();
}

// ================= DỮ LIỆU MẪU VÀ GIÁ TRỊ KHỞI TẠO =================
let inventoryData = JSON.parse(localStorage.getItem(STORAGE_KEY_INV)) || [
    { id: 1, name: 'Tụ hóa 100uF 25V', unit: 'pcs', qty: 150, price: 1200, supplier: 'https://shopee.vn/tuhua100uf', imgUrl: 'https://images.unsplash.com/photo-1608564697071-ddf911d81370?w=100&auto=format&fit=crop&q=80', date: '2026-09-20' },
    { id: 2, name: 'Điện trở 1K Ohm 1/4W 1%', unit: 'pcs', qty: 500, price: 200, supplier: 'Cửa hàng Minh Hà', imgUrl: '', date: '2026-09-15' },
    { id: 3, name: 'Điện trở 100 Ohm 1/4W', unit: 'pcs', qty: 320, price: 200, supplier: 'Shopee', imgUrl: '', date: '2026-09-18' },
    { id: 4, name: 'Vi điều khiển ESP32 WROOM 32D', unit: 'bộ', qty: 8, price: 75000, supplier: 'https://pantech.vn/esp32', imgUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=100&auto=format&fit=crop&q=80', date: '2026-09-22' }
];

let bomProducts = JSON.parse(localStorage.getItem(STORAGE_KEY_BOM)) || [
    {
        id: 101,
        name: 'Mạch Đo Nhiệt Độ ESP32',
        items: [
            { componentId: 1, qtyRequired: 15 },
            { componentId: 2, qtyRequired: 50 },
            { componentId: 3, qtyRequired: 20 },
            { componentId: 4, qtyRequired: 1 }
        ]
    }
];

let procurementList = JSON.parse(localStorage.getItem(STORAGE_KEY_PROC)) || [
    { componentId: 4, qtyToBuy: 10, price: 75000 }
];

let historyLogs = JSON.parse(localStorage.getItem(STORAGE_KEY_LOGS)) || [
    { timestamp: '2026-09-25 08:30', type: 'IN', name: 'Tụ hóa 100uF 25V', qty: 100, user: 'Admin', note: 'Khởi tạo hệ thống' }
];

const DEFAULT_IMG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='1.5'><rect x='2' y='2' width='20' height='20' rx='4'/><path d='M6 12h12M12 6v12'/></svg>";

// ================= KHỞI TẠO GIAO DIỆN VÀ TẢI DỮ LIỆU =================
document.addEventListener('DOMContentLoaded', () => {
    initializeLanguageSupport();
    renderGuideWorkflow();
    setupTopbarInteractions();
    applyAppTheme(appTheme);
    renderSettingsControls();
    void initializeSupabaseAuth();
});

// ================= LƯU TRỮ CỤC BỘ VÀ API DỮ LIỆU NHÓM =================
async function apiRequest(path, options = {}) {
    const [, , collectionName, rawId] = path.split('/');
    const collections = {
        'guide-content': { key: STORAGE_KEY_GUIDE_CONTENT, read: () => sharedGuideContent, write: value => { sharedGuideContent = value; } },
        todos: { key: STORAGE_KEY_SHARED_TODOS, read: () => sharedTodos, write: value => { sharedTodos = value; } },
        notes: { key: STORAGE_KEY_SHARED_NOTES, read: () => sharedNotes, write: value => { sharedNotes = value; } }
    };
    const collection = collections[collectionName];
    if (!collection || path.split('/').length > 4) throw new Error('Đường dẫn dữ liệu cục bộ không hợp lệ.');

    const method = (options.method || 'GET').toUpperCase();
    const items = collection.read();
    const id = rawId ? decodeURIComponent(rawId) : '';
    const now = new Date().toISOString();
    const body = options.body ? JSON.parse(options.body) : {};

    if (method === 'GET' && !id) return items;
    if (method === 'POST' && !id) {
        const item = { ...body, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
        if (collectionName === 'notes') item.updated_at = now;
        if (collectionName === 'todos') item.created_at = now;
        items.unshift(item);
        collection.write(items);
        persistToLocalStorage(collection.key, JSON.stringify(items));
        return item;
    }
    const itemIndex = items.findIndex(item => String(item.id) === id);
    if (itemIndex < 0) throw new Error('Không tìm thấy mục dữ liệu cần cập nhật.');
    if (method === 'PUT') {
        const updated = { ...items[itemIndex], ...body };
        if (collectionName === 'notes') updated.updated_at = now;
        items[itemIndex] = updated;
        collection.write(items);
        persistToLocalStorage(collection.key, JSON.stringify(items));
        return updated;
    }
    if (method === 'DELETE') {
        items.splice(itemIndex, 1);
        collection.write(items);
        persistToLocalStorage(collection.key, JSON.stringify(items));
        return null;
    }
    throw new Error(`Thao tác ${method} không được hỗ trợ.`);
}

// ================= PHIÊN ĐĂNG NHẬP VÀ KHỞI TẠO ỨNG DỤNG =================
async function initializeSupabaseAuth() {
    showLogin();
    const configuration = window.NAPHUTECH_SUPABASE_CONFIG;
    if (!configuration?.url || !configuration.anonKey || !window.supabase?.createClient) {
        showLoginError('Đăng nhập chưa được cấu hình. Quản trị viên cần thêm SUPABASE_URL và SUPABASE_ANON_KEY vào biến môi trường Netlify.');
        return;
    }
    try {
        supabaseClient = window.supabase.createClient(configuration.url, configuration.anonKey);
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session?.user) {
                window.setTimeout(() => {
                    activateAuthenticatedSession(session.user).catch(error => {
                        showLoginError(`Không thể tải dữ liệu nhóm: ${error.message}`);
                    });
                }, 0);
            } else if (event === 'SIGNED_OUT') {
                handleAuthenticatedSignOut();
            }
        });
        if (data.session?.user) await activateAuthenticatedSession(data.session.user);
    } catch (error) {
        showLoginError(`Không thể khởi tạo đăng nhập nhóm: ${error.message}`);
    }
}

async function activateAuthenticatedSession(user) {
    if (appInitialized && currentAuthUser?.id === user.id) return;
    if (authActivationPromise) {
        if (authActivationUserId === user.id) return authActivationPromise;
        await authActivationPromise.catch(() => {});
    }
    authActivationUserId = user.id;
    authActivationPromise = (async () => {
        workspaceSyncEnabled = false;
        currentAuthUser = user;
        activeUserName = user.email || 'Thành viên';
        try {
            await loadWorkspaceFromCloud(user);
            document.getElementById('currentUserDisplay').textContent = activeUserName;
            renderTopbarAccount();
            showApplication();
            initializeApplication();
            await refreshSharedWorkspaceData();
            subscribeToWorkspaceChanges(user);
            document.getElementById('localLoginError').classList.add('hidden');
        } catch (error) {
            workspaceSyncEnabled = false;
            currentAuthUser = null;
            showLoginError(`Không thể tải dữ liệu nhóm: ${error.message}`);
            throw error;
        }
    })();
    try {
        await authActivationPromise;
    } finally {
        authActivationPromise = null;
        authActivationUserId = '';
    }
}

function subscribeToWorkspaceChanges(user) {
    if (workspaceRealtimeChannel) {
        void supabaseClient.removeChannel(workspaceRealtimeChannel);
    }
    workspaceRealtimeChannel = supabaseClient
        .channel('shared-workspace-state')
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'workspace_state',
            filter: 'id=eq.1'
        }, payload => {
            if (payload.new.updated_by === currentAuthUser?.id ||
                currentAuthUser?.id !== user.id) return;
            try {
                applyWorkspaceSnapshot(payload.new.state);
                renderWorkspaceAfterRemoteUpdate();
            } catch (error) {
                notifyFailure(`Không thể tải thay đổi từ thành viên khác: ${error.message}`);
            }
        })
        .subscribe(status => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                notifyFailure('Đồng bộ trực tiếp không khả dụng. Hãy tải lại trang để nhận dữ liệu mới nhất.');
            }
        });
}

function showLoginError(message) {
    const error = document.getElementById('localLoginError');
    error.textContent = message;
    error.classList.remove('hidden');
}

function handleAuthenticatedSignOut() {
    workspaceSyncEnabled = false;
    currentAuthUser = null;
    activeUserName = '';
    appInitialized = false;
    workspaceRealtimeChannel = null;
    window.clearTimeout(workspaceSyncTimer);
    workspaceSyncTimer = null;
    pendingWorkspaceStorageKeys.clear();
    SHARED_WORKSPACE_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
    inventoryData = [];
    bomProducts = [];
    procurementList = [];
    historyLogs = [];
    transactionReceipts = [];
    workspaceProjects = [];
    workspacePlans = [];
    guideSteps = defaultGuideSteps.map(step => ({ ...step, done: false, custom: false }));
    sharedGuideContent = [];
    sharedTodos = [];
    sharedNotes = [];
    workspaceMembers = [];
    document.getElementById('localLoginForm').reset();
    document.getElementById('localLoginError').classList.add('hidden');
    showLogin();
}

async function refreshSharedWorkspaceData() {
    try {
        const readCollection = key => {
            const stored = localStorage.getItem(key);
            const value = stored ? JSON.parse(stored) : [];
            if (!Array.isArray(value)) throw new Error('Dữ liệu đã lưu trong trình duyệt không hợp lệ.');
            return value;
        };
        const [guideContent, todos, notes] = [
            readCollection(STORAGE_KEY_GUIDE_CONTENT),
            readCollection(STORAGE_KEY_SHARED_TODOS),
            readCollection(STORAGE_KEY_SHARED_NOTES)
        ];
        if (!Array.isArray(guideContent) || !Array.isArray(todos) || !Array.isArray(notes)) {
            throw new Error('Dữ liệu không hợp lệ.');
        }
        sharedGuideContent = guideContent;
        sharedTodos = todos;
        sharedNotes = notes;
        renderWorkspaceDashboard();
        renderSharedGuideContent();
        return true;
    } catch (error) {
        notifyFailure(`Không tải được dữ liệu nhóm trên trình duyệt: ${error.message}`);
        return false;
    }
}

function initializeApplication() {
    if (appInitialized) return;
    appInitialized = true;

    saveStateToStorage();
    workspaceProjects.forEach(syncWorkspaceProjectDatePlans);
    saveWorkspaceState();
    const compDateInput = document.getElementById('compDate');
    if (compDateInput) {
        compDateInput.value = new Date().toISOString().split('T')[0];
    }
    renderInventory();
    renderBOMProducts();
    populateTransactionProjectSelect();
    initializeTransactionReceiptFields();
    renderBatchTxSheet();
    renderProcurement();
    renderHistory();
    updateDataLists();
    renderWorkspaceCalendar();
    renderWorkspaceDashboard();
    renderGuideWorkflow();
    renderTopbarAccount();
    renderWorkspaceProjects();
    setupBackdropClick();
    switchTab('overview');
}

// ================= TƯƠNG TÁC THANH ĐẦU VÀ ĐĂNG NHẬP =================
function setupTopbarInteractions() {
    document.addEventListener('click', event => {
        if (!event.target.closest('.topbar-popover-wrap')) closeTopbarPopovers();
        const search = document.getElementById('globalDashboardSearch');
        if (!event.target.closest('.dashboard-search') && window.innerWidth <= 480) {
            search?.closest('.dashboard-search')?.classList.remove('is-open');
        }
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeTopbarPopovers();
        if (event.key === 'Escape' && window.innerWidth <= 480) {
            document.getElementById('globalDashboardSearch')?.closest('.dashboard-search')?.classList.remove('is-open');
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            document.getElementById('globalDashboardSearch')?.closest('.dashboard-search')?.classList.add('is-open');
            document.getElementById('globalDashboardSearch')?.focus();
        }
    });
    document.querySelector('.dashboard-search')?.addEventListener('click', () => {
        if (window.innerWidth <= 480) {
            document.querySelector('.dashboard-search')?.classList.add('is-open');
            document.getElementById('globalDashboardSearch')?.focus();
        }
    });
}

async function handleLocalLogin(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const email = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const error = document.getElementById('localLoginError');
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
        if (!supabaseClient) throw new Error('Dịch vụ đăng nhập chưa được cấu hình.');
        const { data, error: signInError } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        if (!data.user) throw new Error('Dịch vụ đăng nhập không trả về tài khoản thành viên.');
        error.classList.add('hidden');
        await activateAuthenticatedSession(data.user);
        form.reset();
        notifySuccess('Đăng nhập thành công.');
    } catch (requestError) {
        showLoginError(`Đăng nhập thất bại: ${requestError.message}`);
    } finally {
        submit.disabled = false;
    }
}

function showLogin() {
    document.getElementById('localLoginView').classList.remove('hidden');
    document.getElementById('appShell').classList.add('hidden');
    document.getElementById('appShell').classList.remove('flex');
}

function showApplication() {
    document.getElementById('localLoginView').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');
    document.getElementById('appShell').classList.add('flex');
}

function saveStateToStorage() {
    persistToLocalStorage(STORAGE_KEY_INV, JSON.stringify(inventoryData));
    persistToLocalStorage(STORAGE_KEY_BOM, JSON.stringify(bomProducts));
    persistToLocalStorage(STORAGE_KEY_PROC, JSON.stringify(procurementList));
    persistToLocalStorage(STORAGE_KEY_LOGS, JSON.stringify(historyLogs));
    persistToLocalStorage(STORAGE_KEY_TX_RECEIPTS, JSON.stringify(transactionReceipts));
    saveWorkspaceState();
}

// ================= ĐIỀU HƯỚNG SIDEBAR VÀ LƯU TRẠNG THÁI =================
function toggleSubMenu() {
    const container = document.getElementById('subMenuContainer');
    const arrow = document.getElementById('subMenuArrow');
    container.classList.toggle('hidden');
    arrow.classList.toggle('rotate-180');
}

function toggleWorkspaceMenu() {
    const container = document.getElementById('workspaceMenuContainer');
    const arrow = document.getElementById('workspaceMenuArrow');
    container.classList.toggle('hidden');
    arrow.classList.toggle('rotate-180');
}

function saveWorkspaceState() {
    persistToLocalStorage(STORAGE_KEY_WORKSPACE_PROJECTS, JSON.stringify(workspaceProjects));
    persistToLocalStorage(STORAGE_KEY_WORKSPACE_PLANS, JSON.stringify(workspacePlans));
}

// ================= TAB LỊCH: ĐỒNG BỘ KẾ HOẠCH VÀ TIỆN ÍCH NGÀY =================
function syncWorkspaceProjectDatePlans(project) {
    const existingAutoPlans = workspacePlans.filter(plan =>
        String(plan.projectId) === String(project.id) && plan.source === 'project-date'
    );
    const existingAutoPlansByTaskDate = new Map(
        existingAutoPlans.map(plan => [`${String(plan.taskId)}:${plan.date}`, plan])
    );
    workspacePlans = workspacePlans.filter(plan =>
        String(plan.projectId) !== String(project.id) || plan.source !== 'project-date'
    ).concat(existingAutoPlans.filter(plan => plan.completionLogs?.length));

    project.tasks.forEach(task => {
        const startDate = task.startDate || task.date;
        const endDate = task.endDate || task.deadline || startDate;
        if (!startDate || !endDate || endDate < startDate) return;

        const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
        const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
        const currentDate = new Date(startYear, startMonth - 1, startDay);
        const lastDate = new Date(endYear, endMonth - 1, endDay);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
            !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
            Number.isNaN(currentDate.getTime()) ||
            Number.isNaN(lastDate.getTime()) ||
            localDateString(currentDate) !== startDate ||
            localDateString(lastDate) !== endDate) return;

        while (currentDate <= lastDate) {
            const date = localDateString(currentDate);
            const existingPlan = workspacePlans.find(plan =>
                plan.date === date &&
                String(plan.projectId) === String(project.id) &&
                String(plan.taskId) === String(task.id)
            );
            if (!existingPlan) {
                const previousAutoPlan = existingAutoPlansByTaskDate.get(`${String(task.id)}:${date}`);
                workspacePlans.push({
                    ...previousAutoPlan,
                    id: previousAutoPlan?.id || `${date}-${project.id}-${task.id}`,
                    date,
                    projectId: String(project.id),
                    taskId: String(task.id),
                    done: previousAutoPlan?.done || false,
                    source: 'project-date'
                });
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
    });
}

function localDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatWorkspaceDate(dateString, options = { day: 'numeric', month: 'long', year: 'numeric' }) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(appLanguage === 'en' ? 'en-US' : 'vi-VN', options);
}

function getWorkspaceTaskQuantity(task) {
    return Number.isInteger(Number(task.quantity)) && Number(task.quantity) > 0 ? Number(task.quantity) : 1;
}

function getWorkspaceTaskDateRange(task) {
    const startDate = task.startDate || task.date;
    const endDate = task.endDate || task.deadline || startDate;
    if (!startDate || !endDate) return '';
    return `Từ ${formatWorkspaceDate(startDate)} đến ${formatWorkspaceDate(endDate)}`;
}

function getWorkspacePlanCompletedQuantity(plan, task) {
    if (Number.isInteger(plan.completedQty) && plan.completedQty >= 0) return plan.completedQty;
    return plan.done ? getWorkspaceTaskQuantity(task) : 0;
}

function getWorkspacePlanTime(plan, task) {
    return Object.prototype.hasOwnProperty.call(plan || {}, 'time')
        ? plan.time || ''
        : task.time || '';
}

function getWorkspaceTodosForDate(date) {
    return sharedTodos.filter(todo => {
        if (todo.due_date) {
            return todo.status === 'done'
                ? todo.completed_date === date || (!todo.completed_date && todo.due_date === date)
                : todo.due_date === date;
        }
        return todo.status === 'done'
            ? todo.completed_date === date
            : true;
    });
}

function getWorkspaceTaskProgressForPlan(plan, task) {
    const targetQuantity = getWorkspaceTaskQuantity(task);
    const completedToday = Math.min(getWorkspacePlanCompletedQuantity(plan, task), targetQuantity);

    return {
        targetQuantity,
        completedToday,
        remainingAtStart: targetQuantity,
        remainingToday: targetQuantity - completedToday
    };
}

function isWorkspacePlanDone(plan, task) {
    return getWorkspaceTaskProgressForPlan(plan, task).remainingToday === 0;
}

// ================= TAB LỊCH: HIỂN THỊ LỊCH VÀ NGÀY ĐƯỢC CHỌN =================
function renderWorkspaceCalendar() {
    const calendarGrid = document.getElementById('workspaceCalendarGrid');
    const monthInput = document.getElementById('workspaceCalendarMonthInput');
    if (!calendarGrid || !monthInput) return;

    if (!monthInput.value) monthInput.value = localDateString(new Date()).slice(0, 7);
    const [year, month] = monthInput.value.split('-').map(Number);
    if (!year || !month) return;

    const firstDayOffset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = localDateString(new Date());
    calendarGrid.innerHTML = '';

    for (let blank = 0; blank < firstDayOffset; blank++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'workspace-calendar-empty';
        emptyCell.setAttribute('aria-hidden', 'true');
        calendarGrid.appendChild(emptyCell);
    }

    for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber++) {
        const dateString = `${year}-${String(month).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
        const dayPlans = workspacePlans.filter(plan => plan.date === dateString);
        const dayButton = document.createElement('button');
        dayButton.type = 'button';
        dayButton.className = `workspace-calendar-day text-left${dateString === today ? ' is-today' : ''}${dayPlans.length ? ' has-plans' : ''}`;
        dayButton.setAttribute('aria-label', `${formatWorkspaceDate(dateString)}, ${dayPlans.length} công việc`);
        dayButton.onclick = () => openWorkspacePlanModal(dateString);

        const heading = document.createElement('b');
        heading.textContent = String(dayNumber);
        dayButton.appendChild(heading);

        dayPlans.slice(0, 3).forEach(plan => {
            const task = workspaceProjects.find(project => String(project.id) === String(plan.projectId))
                ?.tasks.find(item => String(item.id) === String(plan.taskId));
            const project = workspaceProjects.find(item => String(item.id) === String(plan.projectId));
            if (!task || !project) return;
            const pill = document.createElement('span');
            pill.className = 'workspace-event-pill block truncate';
            const progress = getWorkspaceTaskProgressForPlan(plan, task);
            pill.textContent = `${task.title} · ${progress.completedToday}/${progress.targetQuantity}`;
            pill.title = `${project.name} · ${task.title} · Đã làm hôm nay ${progress.completedToday}/${progress.targetQuantity} · Còn ${progress.remainingToday} trong ngày`;
            dayButton.appendChild(pill);
        });
        if (dayPlans.length > 3) {
            const more = document.createElement('span');
            more.className = 'block mt-1 text-[10px] text-slate-500';
            more.textContent = `+${dayPlans.length - 3} công việc`;
            dayButton.appendChild(more);
        }
        calendarGrid.appendChild(dayButton);
    }
}

// ================= TAB TỔNG QUAN CÔNG VIỆC VÀ TIẾN ĐỘ TRONG NGÀY =================
function renderWorkspaceDashboard() {
    const dateInput = document.getElementById('workspaceDashboardDate');
    if (!workspaceDashboardDate) workspaceDashboardDate = localDateString(new Date());
    if (dateInput && dateInput.value !== workspaceDashboardDate) dateInput.value = workspaceDashboardDate;
    const selectedDate = workspaceDashboardDate;
    const selectedDateLabel = formatWorkspaceDate(selectedDate, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    document.getElementById('workspaceDashboardScheduleTitle').textContent = `${appLanguage === 'en' ? 'Schedule' : 'Lịch trình'} · ${selectedDateLabel}`;

    const dayPlans = workspacePlans.filter(plan => plan.date === selectedDate);
    const dayTodos = getWorkspaceTodosForDate(selectedDate);
    let completedTodayQuantity = 0;
    let plannedTodayQuantity = 0;
    const dayDoneCount = dayPlans.filter(plan => {
        const task = workspaceProjects.find(project => String(project.id) === String(plan.projectId))
            ?.tasks.find(item => String(item.id) === String(plan.taskId));
        if (task) {
            const taskProgress = getWorkspaceTaskProgressForPlan(plan, task);
            plannedTodayQuantity += taskProgress.targetQuantity;
            completedTodayQuantity += taskProgress.completedToday;
        }
        return task && isWorkspacePlanDone(plan, task);
    }).length;
    const completedTodoCount = dayTodos.filter(todo => todo.status === 'done').length;
    plannedTodayQuantity += dayTodos.length;
    completedTodayQuantity += completedTodoCount;
    const dayTaskCount = dayPlans.length + dayTodos.length;
    const dayDoneTaskCount = dayDoneCount + completedTodoCount;
    const remainingTodayQuantity = Math.max(0, plannedTodayQuantity - completedTodayQuantity);
    const progress = plannedTodayQuantity
        ? Math.round((completedTodayQuantity / plannedTodayQuantity) * 100)
        : 0;
    const setText = (id, text) => {
        const element = document.getElementById(id);
        if (element) element.textContent = text;
    };
    setText('workspaceWorkTaskCount', formatNumber(dayTaskCount));
    setText('workspaceWorkDoneCount', `${formatNumber(dayDoneTaskCount)} ${appText('completed')}`);
    setText('workspaceWorkProgress', `${progress}%`);
    const workProgressBar = document.getElementById('workspaceWorkProgressBar');
    if (workProgressBar) workProgressBar.style.width = `${progress}%`;
    const workProgressQuantity = document.getElementById('workspaceTodayProgressQuantity');
    if (workProgressQuantity) workProgressQuantity.textContent =
        `${formatNumber(completedTodayQuantity)} / ${formatNumber(plannedTodayQuantity)} ${appLanguage === 'en' ? 'completed today' : 'hoàn thành hôm nay'} · ${formatNumber(remainingTodayQuantity)} ${appLanguage === 'en' ? 'remaining today' : 'còn lại hôm nay'}`;
    const activeProjects = document.getElementById('overviewActiveProjects');
    if (activeProjects) activeProjects.innerHTML = '';
    if (activeProjects && workspaceProjects.length === 0) {
        activeProjects.innerHTML = `<p class="overview-empty-state"><i class="fa-regular fa-folder-open" aria-hidden="true"></i>${appText('emptyProjects')}</p>`;
    } else if (activeProjects) {
        workspaceProjects.forEach(project => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'overview-project-row';
            const completedTasks = project.tasks.filter(task => workspacePlans.some(plan =>
                String(plan.projectId) === String(project.id) &&
                String(plan.taskId) === String(task.id) &&
                plan.done
            )).length;
            const projectProgress = project.tasks.length ? Math.round(completedTasks / project.tasks.length * 100) : 0;
            row.innerHTML = `<span class="overview-project-icon"><i class="fa-regular fa-folder-open" aria-hidden="true"></i></span>
                <span class="overview-row-main"><strong>${escapeHtml(project.name)}</strong><small>${formatNumber(project.tasks.length)} ${appLanguage === 'en' ? 'tasks' : 'công việc'}</small></span>
                <span class="overview-project-progress"><span>${projectProgress}%</span><span class="overview-mini-progress"><i style="width:${projectProgress}%"></i></span></span>`;
            row.onclick = () => {
                switchTab('projects');
                showWorkspaceProjectCatalog();
                openWorkspaceProjectEditor(project.id);
            };
            activeProjects.appendChild(row);
        });
    }
    const scheduleContainer = document.getElementById('workspaceWorkSchedule');
    const renderSchedule = (container, plans) => {
        if (!container) return;
        container.replaceChildren();
        if (!plans.length) {
            container.innerHTML = `<p class="overview-empty-state"><i class="fa-regular fa-calendar" aria-hidden="true"></i>${appText('emptySchedule')}</p>`;
            return;
        }
        plans.forEach(plan => {
            const project = workspaceProjects.find(item => String(item.id) === String(plan.projectId));
            const task = project?.tasks.find(item => String(item.id) === String(plan.taskId));
            if (!project || !task) return;
            const row = document.createElement('div');
            row.className = 'overview-schedule-row';
            row.innerHTML = `
                <span class="overview-schedule-time">${escapeHtml(getWorkspacePlanTime(plan, task) || '--:--')}</span>
                <span class="overview-schedule-dot"></span>
                <span class="overview-row-main"><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(project.name)} · ${appLanguage === 'en' ? 'Today' : 'Hôm nay'} ${formatNumber(getWorkspaceTaskProgressForPlan(plan, task).completedToday)}/${formatNumber(getWorkspaceTaskQuantity(task))}</small></span>
            `;
            container.appendChild(row);
        });
    };
    renderSchedule(scheduleContainer, dayPlans);
    renderSharedWorkspace();
    const overviewDate = localDateString(new Date());
    const overviewProgressPlans = workspacePlans.filter(plan => plan.date === overviewDate);
    const overviewTodos = getWorkspaceTodosForDate(overviewDate);
    renderSchedule(document.getElementById('overviewTodayScheduleList'), overviewProgressPlans);
    let overviewPlannedQuantity = overviewTodos.length;
    let overviewCompletedQuantity = overviewTodos.filter(todo => todo.status === 'done').length;
    const overviewDoneCount = overviewProgressPlans.filter(plan => {
        const task = workspaceProjects.find(project => String(project.id) === String(plan.projectId))
            ?.tasks.find(item => String(item.id) === String(plan.taskId));
        if (!task) return false;
        const taskProgress = getWorkspaceTaskProgressForPlan(plan, task);
        overviewPlannedQuantity += taskProgress.targetQuantity;
        overviewCompletedQuantity += taskProgress.completedToday;
        return isWorkspacePlanDone(plan, task);
    }).length;
    const overviewTotalTaskCount = overviewProgressPlans.length + overviewTodos.length;
    const overviewTotalDoneCount = overviewDoneCount + overviewTodos.filter(todo => todo.status === 'done').length;
    const overviewProgress = overviewPlannedQuantity
        ? Math.round(overviewCompletedQuantity / overviewPlannedQuantity * 100)
        : 0;
    setText('overviewTodayTaskCount', formatNumber(overviewTotalTaskCount));
    setText('overviewTodayDoneCount', `${formatNumber(overviewTotalDoneCount)} ${appText('completed')}`);
    setText('overviewTodayProgress', `${overviewProgress}%`);
    const overviewProgressBar = document.getElementById('overviewTodayProgressBar');
    if (overviewProgressBar) overviewProgressBar.style.width = `${overviewProgress}%`;
    renderDashboardOverview();
    renderWorkspaceReports();
}

// ================= TAB BÁO CÁO: TỔNG HỢP TIẾN ĐỘ VÀ SỐ LIỆU =================
function setWorkspaceDashboardDate(dateString) {
    if (!dateString) return;
    workspaceDashboardDate = dateString;
    renderWorkspaceDashboard();
}

function renderWorkspaceReports() {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const weekPlans = workspacePlans.filter(plan => {
        const [year, month, day] = plan.date.split('-').map(Number);
        const planDate = new Date(year, month - 1, day);
        return planDate >= weekStart && planDate < weekEnd;
    });
    const doneCount = weekPlans.filter(plan => {
        const task = workspaceProjects.find(project => String(project.id) === String(plan.projectId))
            ?.tasks.find(item => String(item.id) === String(plan.taskId));
        return task && isWorkspacePlanDone(plan, task);
    }).length;
    const completion = weekPlans.length ? Math.round(doneCount / weekPlans.length * 100) : 0;
    const scheduledMinutes = weekPlans.reduce((total, plan) => {
        const project = workspaceProjects.find(item => String(item.id) === String(plan.projectId));
        const task = project?.tasks.find(item => String(item.id) === String(plan.taskId));
        const time = getWorkspacePlanTime(plan, task || {});
        const match = time.match(/^([01]\d|2[0-3]):([0-5]\d) - ([01]\d|2[0-3]):([0-5]\d)$/);
        if (!match) return total;
        const start = Number(match[1]) * 60 + Number(match[2]);
        const end = Number(match[3]) * 60 + Number(match[4]);
        return total + Math.max(0, end - start);
    }, 0);

    document.getElementById('workspaceReportDoneCount').textContent = String(doneCount);
    document.getElementById('workspaceReportPlannedTime').textContent =
        `${Math.floor(scheduledMinutes / 60)}h ${String(scheduledMinutes % 60).padStart(2, '0')}m`;
    document.getElementById('workspaceReportCompletion').textContent = `${completion}%`;
    document.getElementById('workspaceReportProgressLabel').textContent =
        appLanguage === 'en'
            ? `${doneCount} / ${weekPlans.length} tasks completed`
            : `${doneCount} / ${weekPlans.length} công việc hoàn thành`;
    document.getElementById('workspaceReportProgressBar').style.width = `${completion}%`;

    const totalQuantity = inventoryData.reduce((sum, item) => sum + Math.max(0, Number(item.qty) || 0), 0);
    const shortages = getInventoryShortages();
    const projectTaskCount = workspaceProjects.reduce((sum, project) => sum + project.tasks.length, 0);
    const bomLineCount = bomProducts.reduce((sum, product) => sum + (product.items || []).length, 0);
    const setText = (id, text) => {
        const element = document.getElementById(id);
        if (element) element.textContent = text;
    };
    setText('reportMaterialCount', formatNumber(inventoryData.length));
    setText('reportStockQuantity', `${appLanguage === 'en' ? 'On hand:' : 'Tồn kho:'} ${formatNumber(totalQuantity)}`);
    setText('reportShortageCount', formatNumber(shortages.length));
    setText('reportProjectCount', formatNumber(workspaceProjects.length));
    setText('reportProjectTasks', `${formatNumber(projectTaskCount)} ${appLanguage === 'en' ? 'tasks' : 'công việc'}`);
    setText('reportProductCount', formatNumber(bomProducts.length));
    setText('reportBomLineCount', `${formatNumber(bomLineCount)} ${appLanguage === 'en' ? 'BOM lines' : 'dòng định mức'}`);
    setText('reportGeneratedAt', `${appLanguage === 'en' ? 'Generated' : 'Cập nhật'} · ${new Date().toLocaleString(appLanguage === 'en' ? 'en-US' : 'vi-VN')}`);

    const shortageById = new Map(shortages.map(entry => [String(entry.item.id), entry.needed]));
    const materialBody = document.getElementById('reportMaterialsTable');
    if (materialBody) {
        materialBody.replaceChildren();
        inventoryData.forEach(item => {
            const stock = Math.max(0, Number(item.qty) || 0);
            const needed = shortageById.get(String(item.id)) || 0;
            const short = needed > 0 || stock === 0;
            const row = document.createElement('tr');
            row.innerHTML = `<td><strong>${escapeHtml(item.name)}</strong><small>${item.type === 'tool' ? (appLanguage === 'en' ? 'Tool' : 'Dụng cụ') : (appLanguage === 'en' ? 'Component' : 'Linh kiện')}</small></td>
                <td>${escapeHtml(getInventoryWarehouseName(item))}</td>
                <td class="${stock === 0 ? 'report-stock-empty' : ''}">${formatNumber(stock)} ${escapeHtml(item.unit || '')}</td>
                <td>${needed ? formatNumber(needed) : '—'} ${needed ? escapeHtml(item.unit || '') : ''}</td>
                <td><span class="report-status ${short ? 'is-low' : 'is-good'}">${short ? (stock === 0 ? appText('outOfStock') : appText('restock')) : appText('inStock')}</span></td>`;
            materialBody.appendChild(row);
        });
        if (!inventoryData.length) {
            materialBody.innerHTML = `<tr><td colspan="5" class="report-table-empty">${appText('noReportData')}</td></tr>`;
        }
    }

    const projectList = document.getElementById('reportProjectsList');
    if (projectList) {
        projectList.replaceChildren();
        if (!workspaceProjects.length) projectList.innerHTML = `<p class="overview-empty-state">${appText('emptyProjects')}</p>`;
        workspaceProjects.forEach(project => {
            const completedTasks = project.tasks.filter(task => workspacePlans.some(plan =>
                String(plan.projectId) === String(project.id) &&
                String(plan.taskId) === String(task.id) &&
                isWorkspacePlanDone(plan, task)
            )).length;
            const percent = project.tasks.length ? Math.round(completedTasks / project.tasks.length * 100) : 0;
            const row = document.createElement('div');
            row.className = 'report-progress-row';
            row.innerHTML = `<div class="report-progress-copy"><strong>${escapeHtml(project.name)}</strong><span>${formatNumber(completedTasks)} / ${formatNumber(project.tasks.length)} ${appLanguage === 'en' ? 'tasks complete' : 'công việc hoàn thành'}</span></div>
                <strong class="report-progress-percent">${percent}%</strong><div class="workspace-progress"><div class="workspace-progress-bar" style="width:${percent}%"></div></div>`;
            projectList.appendChild(row);
        });
    }

    const productList = document.getElementById('reportProductsList');
    if (productList) {
        productList.replaceChildren();
        if (!bomProducts.length) productList.innerHTML = `<p class="overview-empty-state">${appText('noBOMItems')}</p>`;
        bomProducts.forEach(product => {
            const row = document.createElement('div');
            row.className = 'report-product-row';
            row.innerHTML = `<span class="report-product-icon"><i class="fa-solid fa-microchip" aria-hidden="true"></i></span>
                <span class="overview-row-main"><strong>${escapeHtml(product.name)}</strong><small>${formatNumber((product.items || []).length)} ${appLanguage === 'en' ? 'components in BOM' : 'linh kiện trong định mức'}</small></span>
                <i class="fa-solid fa-chevron-right report-product-chevron" aria-hidden="true"></i>`;
            productList.appendChild(row);
        });
    }
}

// ================= MODAL TIẾN ĐỘ CÔNG VIỆC =================
function toggleWorkspaceTask(planId) {
    const plan = workspacePlans.find(item => String(item.id) === String(planId));
    if (!plan) return;
    const project = workspaceProjects.find(item => String(item.id) === String(plan.projectId));
    const task = project?.tasks.find(item => String(item.id) === String(plan.taskId));
    if (!task) return;

    const progress = getWorkspaceTaskProgressForPlan(plan, task);
    if (!progress.remainingAtStart && !progress.completedToday) return;
    workspaceProgressMode = progress.remainingToday === 0 ? 'set' : 'add';

    workspaceProgressPlanId = String(plan.id);
    const quantityInput = document.getElementById('workspaceProgressQuantity');
    quantityInput.min = workspaceProgressMode === 'set' ? '0' : '1';
    quantityInput.max = String(progress.remainingAtStart);
    quantityInput.value = workspaceProgressMode === 'set'
        ? String(progress.completedToday)
        : String(progress.remainingToday);
    document.getElementById('workspaceTaskProgressModalTitle').textContent =
        workspaceProgressMode === 'set' ? 'Điều chỉnh số lượng đã làm trong ngày' : 'Cập nhật tiến độ công việc';
    document.getElementById('workspaceProgressTaskTitle').textContent = `${task.title} · ${project.name}`;
    document.getElementById('workspaceProgressQuantityLabel').textContent =
        workspaceProgressMode === 'set'
            ? `Đã làm hôm nay ${progress.completedToday}/${progress.targetQuantity}. Nhập lại số đã làm hôm nay (0–${progress.targetQuantity}).`
            : `Còn phải làm hôm nay: ${progress.remainingToday}/${progress.targetQuantity}. Đã làm hôm nay ${progress.completedToday}/${progress.targetQuantity}.`;
    document.getElementById('workspaceProgressNote').value = '';
    document.getElementById('workspaceTaskProgressModal').classList.remove('hidden');
    quantityInput.focus();
}

function closeWorkspaceTaskProgressModal() {
    document.getElementById('workspaceTaskProgressModal').classList.add('hidden');
    workspaceProgressPlanId = '';
    workspaceProgressMode = 'add';
}

function saveWorkspaceTaskProgress() {
    const plan = workspacePlans.find(item => String(item.id) === workspaceProgressPlanId);
    if (!plan) {
        notifyFailure('Cập nhật tiến độ thất bại. Không tìm thấy kế hoạch công việc.');
        closeWorkspaceTaskProgressModal();
        return;
    }
    const project = workspaceProjects.find(item => String(item.id) === String(plan.projectId));
    const task = project?.tasks.find(item => String(item.id) === String(plan.taskId));
    if (!task) {
        notifyFailure('Cập nhật tiến độ thất bại. Không tìm thấy công việc trong dự án.');
        return;
    }

    const quantityInput = document.getElementById('workspaceProgressQuantity');
    const quantity = Number(quantityInput.value);
    const targetQuantity = getWorkspaceTaskQuantity(task);
    const progress = getWorkspaceTaskProgressForPlan(plan, task);
    const isAdjustment = workspaceProgressMode === 'set';
    const maximumQuantity = progress.remainingAtStart;
    const minimumQuantity = isAdjustment ? 0 : 1;
    if (!Number.isInteger(quantity) || quantity < minimumQuantity || quantity > maximumQuantity) {
        notifyFailure(`Cập nhật tiến độ thất bại. Vui lòng nhập số lượng từ ${minimumQuantity} đến ${maximumQuantity}.`);
        quantityInput.focus();
        return;
    }

    const note = document.getElementById('workspaceProgressNote').value.trim();
    const completedAt = new Date().toISOString();
    plan.completedQty = isAdjustment ? quantity : progress.completedToday + quantity;
    plan.done = plan.completedQty >= targetQuantity;
    plan.completionLogs = [...(plan.completionLogs || []), {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: isAdjustment ? 'adjustment' : 'progress',
        quantity,
        note,
        completedAt
    }];
    saveWorkspaceState();
    closeWorkspaceTaskProgressModal();
    renderWorkspaceDashboard();
    renderWorkspaceCalendar();
    renderWorkspaceProjects();
    notifySuccess(isAdjustment ? 'Điều chỉnh tiến độ công việc thành công.' : 'Cập nhật tiến độ công việc thành công.');
}

// ================= TAB DỰ ÁN: DANH MỤC, TIẾN ĐỘ VÀ TÌM KIẾM =================
function renderWorkspaceProjects() {
    const container = document.getElementById('workspaceProjectCards');
    if (!container) return;
    document.getElementById('workspaceProjectCount').textContent = workspaceProjects.length.toLocaleString('vi-VN');
    const projectTotals = workspaceProjects.reduce((totals, project) => {
        const progress = getWorkspaceProjectProgress(project);
        totals.taskCount += progress.total;
        totals.completedCount += progress.completed;
        return totals;
    }, { taskCount: 0, completedCount: 0 });
    document.getElementById('workspaceProjectTaskCount').textContent = projectTotals.taskCount.toLocaleString('vi-VN');
    document.getElementById('workspaceProjectCompletion').textContent =
        `${projectTotals.taskCount ? Math.round(projectTotals.completedCount / projectTotals.taskCount * 100) : 0}%`;
    renderWorkspaceProjectSummaryTable();
    container.innerHTML = '';

    const normalizedSearch = workspaceProjectSearchTerm.toLocaleLowerCase('vi');
    const projects = workspaceProjects.filter(project =>
        !normalizedSearch || project.name.toLocaleLowerCase('vi').includes(normalizedSearch)
    );
    const summary = document.getElementById('workspaceProjectSearchSummary');
    if (summary) {
        summary.classList.toggle('hidden', !normalizedSearch);
        summary.textContent = normalizedSearch
            ? `Tìm thấy ${projects.length} dự án phù hợp với “${workspaceProjectSearchTerm}”. Công việc đã cấu hình được liệt kê trong từng kết quả.`
            : '';
    }

    if (projects.length === 0) {
        container.innerHTML = `<div class="col-span-full bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center text-sm text-slate-500">${normalizedSearch ? 'Không tìm thấy dự án phù hợp.' : 'Chưa có dự án. Nhấn “Thêm Dự Án” để bắt đầu.'}</div>`;
        return;
    }

    projects.forEach(project => {
        const card = document.createElement('article');
        card.className = 'bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition';
        card.innerHTML = `
            <div class="flex justify-between items-start gap-2">
                <h3 class="font-bold text-sm text-slate-800">📁 ${escapeHtml(project.name)}</h3>
            </div>
            <p class="text-xs text-slate-500 mt-2">${project.tasks.length} công việc</p>
            <button type="button" onclick="openWorkspaceProjectEditor('${escapeHtml(String(project.id))}')" class="mt-4 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100"><i class="fa-solid fa-pen mr-1"></i> Chỉnh Sửa Cấu Hình</button>
        `;
        container.appendChild(card);
    });
}

function getWorkspaceProjectProgress(project) {
    const total = project.tasks.length;
    const completed = project.tasks.filter(task => {
        const taskPlans = workspacePlans.filter(plan =>
            String(plan.projectId) === String(project.id) && String(plan.taskId) === String(task.id)
        );
        const completedQuantity = taskPlans.reduce(
            (sum, plan) => sum + getWorkspacePlanCompletedQuantity(plan, task),
            0
        );
        return taskPlans.length > 0 && completedQuantity >= getWorkspaceTaskQuantity(task);
    }).length;
    return { total, completed };
}

function renderWorkspaceProjectSummaryTable() {
    const tbody = document.getElementById('workspaceProjectSummaryTableBody');
    if (!tbody) return;

    const search = document.getElementById('workspaceProjectOverviewSearch').value.trim().toLocaleLowerCase('vi');
    const projects = workspaceProjects.filter(project => project.name.toLocaleLowerCase('vi').includes(search));
    tbody.innerHTML = '';

    if (projects.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="4" class="px-4 py-8 text-center text-slate-500">${search ? 'Không tìm thấy dự án phù hợp.' : 'Chưa có dự án nào được thêm.'}</td>`;
        tbody.appendChild(row);
        return;
    }

    projects.forEach(project => {
        const { total, completed } = getWorkspaceProjectProgress(project);
        const percent = total ? Math.round(completed / total * 100) : 0;
        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-50 transition-colors';
        row.innerHTML = `
            <td class="px-4 py-3.5 font-semibold text-slate-800">${escapeHtml(project.name)}</td>
            <td class="px-4 py-3.5 text-center text-slate-600">${total}</td>
            <td class="px-4 py-3.5 text-center text-slate-600">${completed}/${total}</td>
            <td class="px-4 py-3.5">
                <div class="flex items-center gap-3">
                    <div class="workspace-progress flex-1"><div class="workspace-progress-bar" style="width:${percent}%"></div></div>
                    <span class="w-10 text-right font-semibold text-slate-700">${percent}%</span>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function searchWorkspaceProjects() {
    workspaceProjectSearchTerm = document.getElementById('workspaceProjectSearch').value.trim();
    renderWorkspaceProjects();
}

function showWorkspaceProjectOverview() {
    document.getElementById('workspaceProjectsListView').classList.add('hidden');
    document.getElementById('workspaceProjectsOverviewView').classList.remove('hidden');
}

function showWorkspaceProjectCatalog() {
    document.getElementById('workspaceProjectsOverviewView').classList.add('hidden');
    document.getElementById('workspaceProjectsListView').classList.remove('hidden');
    renderWorkspaceProjects();
}

// ================= MODAL DỰ ÁN: DÒNG CÔNG VIỆC VÀ KIỂM TRA THỜI GIAN =================
function addWorkspaceProjectTaskRow(task = {}) {
    const body = document.getElementById('workspaceProjectTasksBody');
    const projectName = document.getElementById('workspaceProjectName').value.trim();
    const row = document.createElement('tr');
    row.className = 'workspace-project-task-row';
    row.dataset.taskId = task.id || '';
    const assignedNames = normalizeWorkspaceMemberNames(task.assignees);
    workspaceMembers = normalizeWorkspaceMemberNames([...workspaceMembers, ...assignedNames]);
    const assigneeOptions = workspaceMembers.map(name =>
        `<option value="${escapeHtml(name)}"${assignedNames.includes(name) ? ' selected' : ''}>${escapeHtml(name)}</option>`
    ).join('');
    row.innerHTML = `
        <td class="p-2"><input data-field="title" type="text" value="${escapeHtml(task.title || '')}" placeholder="Tên công việc" class="w-full min-w-36 px-2 py-2 border border-slate-200 rounded-md" required></td>
        <td class="p-2"><input data-field="project" type="text" value="${escapeHtml(task.project || projectName)}" placeholder="Dự án" class="w-full min-w-32 px-2 py-2 border border-slate-200 rounded-md bg-slate-50" readonly></td>
        <td class="p-2"><input data-field="note" type="text" value="${escapeHtml(task.note || '')}" placeholder="Ghi chú" class="w-full min-w-32 px-2 py-2 border border-slate-200 rounded-md"></td>
        <td class="p-2">
            <select data-field="priority" class="w-full min-w-32 px-2 py-2 border border-slate-200 rounded-md">
                ${['Dễ', 'Bình thường', 'Quan trọng', 'Gấp'].map(priority => `<option${(task.priority || 'Bình thường') === priority ? ' selected' : ''}>${priority}</option>`).join('')}
            </select>
        </td>
        <td class="p-2"><input data-field="startDate" type="date" value="${escapeHtml(task.startDate || task.date || '')}" aria-label="Ngày bắt đầu" class="px-2 py-2 border border-slate-200 rounded-md"></td>
        <td class="p-2"><input data-field="endDate" type="date" value="${escapeHtml(task.endDate || task.deadline || task.startDate || task.date || '')}" aria-label="Ngày kết thúc" class="px-2 py-2 border border-slate-200 rounded-md"></td>
        <td class="p-2"><input data-field="quantity" type="number" min="1" step="1" value="${Number(task.quantity) > 0 ? Number(task.quantity) : 1}" aria-label="Số lượng cần làm" class="w-28 px-2 py-2 border border-slate-200 rounded-md" required></td>
        <td class="p-2"><div class="project-task-assignees"><select data-field="assignees" multiple aria-label="Người phụ trách">${assigneeOptions}</select><div class="project-task-add-assignee"><input type="text" maxlength="80" placeholder="Thêm tên" aria-label="Tên thành viên mới" onkeydown="if(event.key==='Enter'){event.preventDefault();addWorkspaceProjectAssignee(this)}"><button type="button" onclick="addWorkspaceProjectAssignee(this.previousElementSibling)" aria-label="Thêm người phụ trách" title="Thêm người phụ trách"><i class="fi fi-rs-plus" aria-hidden="true"></i></button></div></div></td>
        <td class="p-2 text-center"><button type="button" aria-label="Xóa công việc" onclick="this.closest('tr').remove()" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button></td>
    `;
    body.appendChild(row);
}

function addWorkspaceProjectAssignee(input) {
    const name = input.value.trim();
    if (!name) {
        notifyFailure(appText('missingTeamMemberName'));
        input.focus();
        return;
    }
    const existingName = workspaceMembers.find(member => member.toLocaleLowerCase() === name.toLocaleLowerCase());
    const memberName = existingName || name;
    if (!existingName) {
        workspaceMembers.push(memberName);
        saveWorkspaceMembers();
    }
    const row = input.closest('tr');
    const select = row.querySelector('[data-field="assignees"]');
    let option = [...select.options].find(item => item.value === memberName);
    if (!option) {
        option = new Option(memberName, memberName);
        document.querySelectorAll('#workspaceProjectTasksBody [data-field="assignees"]').forEach(taskSelect => {
            if (taskSelect !== select) taskSelect.add(new Option(memberName, memberName));
        });
        select.add(option);
    }
    option.selected = true;
    input.value = '';
}

function getWorkspaceTimePartMaximum(input) {
    return Number(input.dataset.timePart) % 2 === 0 ? 23 : 59;
}

function validateWorkspaceTimePart(input) {
    const value = input.value;
    const invalid = value.length === 2 && Number(value) > getWorkspaceTimePartMaximum(input);
    input.setCustomValidity(invalid ? `Nhập giá trị từ 00 đến ${getWorkspaceTimePartMaximum(input)}.` : '');
    input.classList.toggle('border-red-500', invalid);
    input.setAttribute('aria-invalid', String(invalid));
    return !invalid;
}

function normalizeWorkspaceTimePart(input) {
    if (!input.value) return true;
    input.value = input.value.padStart(2, '0');
    return validateWorkspaceTimePart(input);
}

function handleWorkspaceTimeInput(input) {
    input.value = input.value.replace(/\D/g, '').slice(0, 2);
    const isValid = validateWorkspaceTimePart(input);
    if (input.value.length === 2 && isValid) {
        const next = input.parentElement.querySelector(`[data-time-part="${Number(input.dataset.timePart) + 1}"]`);
        next?.focus();
    }
}

function handleWorkspaceTimeKeydown(event, input) {
    if (event.key === 'Enter') {
        event.preventDefault();
        if (!normalizeWorkspaceTimePart(input)) {
            input.reportValidity();
            return;
        }
        const next = input.parentElement.querySelector(`[data-time-part="${Number(input.dataset.timePart) + 1}"]`);
        next?.focus();
        return;
    }
    if ([':', '-', ' '].includes(event.key)) {
        event.preventDefault();
        return;
    }
    if (event.key === 'Backspace' && !input.value) {
        const previous = input.parentElement.querySelector(`[data-time-part="${Number(input.dataset.timePart) - 1}"]`);
        if (previous) {
            event.preventDefault();
            previous.focus();
            previous.value = previous.value.slice(0, -1);
            previous.setSelectionRange(previous.value.length, previous.value.length);
        }
    }
}

function handleWorkspaceTimePaste(event, input) {
    const pastedDigits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 8);
    if (!pastedDigits) return;
    event.preventDefault();
    const parts = input.parentElement.querySelectorAll('[data-time-part]');
    const start = Number(input.dataset.timePart);
    [...pastedDigits.matchAll(/\d{1,2}/g)].forEach((match, offset) => {
        const part = parts[start + offset];
        if (part) {
            part.value = match[0].slice(0, 2);
            validateWorkspaceTimePart(part);
        }
    });
    parts[Math.min(start + Math.ceil(pastedDigits.length / 2), parts.length - 1)]?.focus();
}

function syncWorkspaceProjectName() {
    const projectName = document.getElementById('workspaceProjectName').value.trim();
    document.querySelectorAll('#workspaceProjectTasksBody [data-field="project"]').forEach(input => {
        input.value = projectName;
    });
}

// ================= MODAL DỰ ÁN: THÊM, SỬA VÀ LƯU DỰ ÁN =================
function openWorkspaceProjectEditor(projectId = null) {
    const project = workspaceProjects.find(item => String(item.id) === String(projectId));
    document.getElementById('workspaceProjectId').value = project ? String(project.id) : '';
    document.getElementById('workspaceProjectName').value = project?.name || '';
    document.getElementById('workspaceProjectModalTitle').textContent = project ? 'Chỉnh Sửa Dự Án' : 'Thêm Dự Án';
    const body = document.getElementById('workspaceProjectTasksBody');
    body.innerHTML = '';
    if (project?.tasks.length) project.tasks.forEach(task => addWorkspaceProjectTaskRow(task));
    else addWorkspaceProjectTaskRow();
    document.getElementById('workspaceProjectModal').classList.remove('hidden');
    document.getElementById('workspaceProjectName').focus();
}

function closeWorkspaceProjectEditor() {
    document.getElementById('workspaceProjectModal').classList.add('hidden');
}

function saveWorkspaceProject() {
    const name = document.getElementById('workspaceProjectName').value.trim();
    if (!name) {
        document.getElementById('workspaceProjectName').focus();
        return;
    }

    const tasks = [...document.querySelectorAll('#workspaceProjectTasksBody tr')].map(row => {
        const value = field => row.querySelector(`[data-field="${field}"]`).value.trim();
        return {
            id: row.dataset.taskId || String(Date.now()) + Math.random().toString(36).slice(2, 7),
            title: value('title'),
            project: value('project') || name,
            note: value('note'),
            priority: value('priority'),
            startDate: value('startDate'),
            endDate: value('endDate'),
            quantity: Number(value('quantity')),
            assignees: [...row.querySelector('[data-field="assignees"]').selectedOptions].map(option => option.value)
        };
    });
    if (tasks.some(task => !task.title)) {
        notifyFailure('Lưu dự án thất bại. Vui lòng nhập tên cho tất cả công việc hoặc xóa dòng trống.');
        return;
    }
    if (tasks.some(task => !Number.isInteger(task.quantity) || task.quantity < 1)) {
        notifyFailure('Lưu dự án thất bại. Số lượng cần làm phải là số nguyên lớn hơn hoặc bằng 1.');
        return;
    }
    if (tasks.some(task => Boolean(task.startDate) !== Boolean(task.endDate))) {
        notifyFailure('Lưu dự án thất bại. Vui lòng nhập cả ngày bắt đầu và ngày kết thúc cho công việc.');
        return;
    }
    if (tasks.some(task => task.startDate && task.endDate < task.startDate)) {
        notifyFailure('Lưu dự án thất bại. Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.');
        return;
    }
    const projectId = document.getElementById('workspaceProjectId').value;
    const oldProject = workspaceProjects.find(item => String(item.id) === projectId);
    const project = { id: oldProject?.id || String(Date.now()), name, tasks };
    if (oldProject) {
        workspaceProjects = workspaceProjects.map(item => item === oldProject ? project : item);
        const validTaskIds = new Set(tasks.map(task => String(task.id)));
        workspacePlans = workspacePlans.filter(plan =>
            String(plan.projectId) !== String(project.id) || validTaskIds.has(String(plan.taskId))
        );
    } else {
        workspaceProjects.push(project);
    }

    syncWorkspaceProjectDatePlans(project);

    saveWorkspaceState();
    renderWorkspaceProjects();
    renderWorkspaceCalendar();
    renderWorkspaceDashboard();
    renderInventory();
    populateTransactionProjectSelect();
    closeWorkspaceProjectEditor();
    notifySuccess(oldProject ? 'Cập nhật dự án thành công.' : 'Thêm dự án thành công.');
}

// ================= MODAL LẬP KẾ HOẠCH VÀ PHÂN BỔ CÔNG VIỆC =================
function openWorkspacePlanModal(dateString) {
    workspacePlanDate = dateString;
    workspacePlanProjectIds = [];
    const selectedPlans = workspacePlans.filter(plan => plan.date === dateString);
    selectedPlans.forEach(plan => {
        if (!workspacePlanProjectIds.includes(String(plan.projectId))) workspacePlanProjectIds.push(String(plan.projectId));
    });
    document.getElementById('workspacePlanDateLabel').textContent = formatWorkspaceDate(dateString, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    renderWorkspaceDayProgressRecords(dateString);
    document.getElementById('workspacePlanProjectSearch').value = '';
    renderWorkspacePlanProjectSelect();
    renderWorkspacePlanProjects();
    document.getElementById('workspacePlanModal').classList.remove('hidden');
}

function renderWorkspaceDayProgressRecords(dateString) {
    const container = document.getElementById('workspaceDayProgressRecords');
    const dayPlans = workspacePlans.filter(plan => plan.date === dateString && plan.completionLogs?.length);
    container.innerHTML = '';
    const heading = document.createElement('h4');
    heading.className = 'font-bold text-sm text-slate-800';
    heading.textContent = 'Ghi nhận hoàn thành trong ngày';
    container.appendChild(heading);

    if (!dayPlans.length) {
        const empty = document.createElement('p');
        empty.className = 'text-xs text-slate-500';
        empty.textContent = 'Chưa có ghi nhận hoàn thành cho ngày này.';
        container.appendChild(empty);
        return;
    }

    dayPlans.forEach(plan => {
        const project = workspaceProjects.find(item => String(item.id) === String(plan.projectId));
        const task = project?.tasks.find(item => String(item.id) === String(plan.taskId));
        if (!project || !task) return;

        const section = document.createElement('div');
        section.className = 'border-t border-slate-200 pt-3 first:border-0 first:pt-0';
        const progress = getWorkspaceTaskProgressForPlan(plan, task);
        const title = document.createElement('p');
        title.className = 'font-semibold text-xs text-slate-800';
        title.textContent = `${task.title} · ${project.name} · Hôm nay ${progress.completedToday}/${progress.targetQuantity}`;
        section.appendChild(title);

        plan.completionLogs.forEach(log => {
            const entry = document.createElement('div');
            entry.className = 'mt-2 rounded-lg bg-white border border-slate-100 p-3';
            const timestamp = document.createElement('p');
            timestamp.className = 'text-[11px] text-slate-500';
            timestamp.textContent = log.type === 'adjustment'
                ? `${new Date(log.completedAt).toLocaleString('vi-VN')} · Điều chỉnh số lượng đã làm trong ngày thành ${log.quantity}`
                : `${new Date(log.completedAt).toLocaleString('vi-VN')} · Hoàn thành thêm ${log.quantity}`;
            entry.appendChild(timestamp);
            if (log.note) {
                const note = document.createElement('p');
                note.className = 'mt-1 text-xs text-slate-700 whitespace-pre-wrap';
                note.textContent = log.note;
                entry.appendChild(note);
            }
            section.appendChild(entry);
        });
        container.appendChild(section);
    });
}

function closeWorkspacePlanModal() {
    document.getElementById('workspacePlanModal').classList.add('hidden');
}

function renderWorkspacePlanProjectSelect() {
    const select = document.getElementById('workspacePlanProjectSelect');
    const search = document.getElementById('workspacePlanProjectSearch').value.trim().toLocaleLowerCase('vi');
    const options = workspaceProjects.filter(project =>
        project.name.toLocaleLowerCase('vi').includes(search) &&
        !workspacePlanProjectIds.includes(String(project.id))
    );
    select.innerHTML = '<option value="">Chọn dự án</option>' +
        options.map(project => `<option value="${escapeHtml(String(project.id))}">${escapeHtml(project.name)}</option>`).join('');
}

function filterWorkspacePlanProjects() {
    renderWorkspacePlanProjectSelect();
}

function addWorkspacePlanProject() {
    const select = document.getElementById('workspacePlanProjectSelect');
    const projectId = select.value;
    if (!projectId) {
        notifyFailure('Thêm dự án vào kế hoạch thất bại. Vui lòng chọn dự án.');
        return;
    }
    workspacePlanProjectIds.push(String(projectId));
    renderWorkspacePlanProjectSelect();
    renderWorkspacePlanProjects();
}

function renderWorkspacePlanTimeInputs(time) {
    const savedTime = time?.match(/^(\d{2}):(\d{2}) - (\d{2}):(\d{2})$/);
    return `
        <div class="workspace-plan-time flex items-center gap-1 pl-6 pb-2" aria-label="Thời gian công việc trong ngày">
            <span class="text-xs text-slate-500 mr-1">Giờ làm:</span>
            <input data-time-part="0" type="text" inputmode="numeric" maxlength="2" value="${savedTime ? savedTime[1] : ''}" placeholder="00" aria-label="Giờ bắt đầu (00-23)" title="Giờ 24 giờ: 00-23" oninput="handleWorkspaceTimeInput(this)" onkeydown="handleWorkspaceTimeKeydown(event, this)" onblur="normalizeWorkspaceTimePart(this)" onpaste="handleWorkspaceTimePaste(event, this)" class="w-9 px-1 py-1.5 text-center border border-slate-200 rounded-md text-xs">
            <span>:</span>
            <input data-time-part="1" type="text" inputmode="numeric" maxlength="2" value="${savedTime ? savedTime[2] : ''}" placeholder="00" aria-label="Phút bắt đầu (00-59)" title="Phút: 00-59" oninput="handleWorkspaceTimeInput(this)" onkeydown="handleWorkspaceTimeKeydown(event, this)" onblur="normalizeWorkspaceTimePart(this)" onpaste="handleWorkspaceTimePaste(event, this)" class="w-9 px-1 py-1.5 text-center border border-slate-200 rounded-md text-xs">
            <span>-</span>
            <input data-time-part="2" type="text" inputmode="numeric" maxlength="2" value="${savedTime ? savedTime[3] : ''}" placeholder="00" aria-label="Giờ kết thúc (00-23)" title="Giờ 24 giờ: 00-23" oninput="handleWorkspaceTimeInput(this)" onkeydown="handleWorkspaceTimeKeydown(event, this)" onblur="normalizeWorkspaceTimePart(this)" onpaste="handleWorkspaceTimePaste(event, this)" class="w-9 px-1 py-1.5 text-center border border-slate-200 rounded-md text-xs">
            <span>:</span>
            <input data-time-part="3" type="text" inputmode="numeric" maxlength="2" value="${savedTime ? savedTime[4] : ''}" placeholder="00" aria-label="Phút kết thúc (00-59)" title="Phút: 00-59" oninput="handleWorkspaceTimeInput(this)" onkeydown="handleWorkspaceTimeKeydown(event, this)" onblur="normalizeWorkspaceTimePart(this)" onpaste="handleWorkspaceTimePaste(event, this)" class="w-9 px-1 py-1.5 text-center border border-slate-200 rounded-md text-xs">
        </div>
    `;
}

function renderWorkspacePlanProjects() {
    const container = document.getElementById('workspacePlanProjectsList');
    container.innerHTML = '';
    const plansForDate = workspacePlans.filter(plan => plan.date === workspacePlanDate);

    workspacePlanProjectIds.forEach(projectId => {
        const project = workspaceProjects.find(item => String(item.id) === projectId);
        if (!project) return;
        const section = document.createElement('div');
        section.className = 'border border-slate-200 rounded-xl p-4';
        const heading = document.createElement('div');
        heading.className = 'flex justify-between items-center gap-3 mb-2';
        heading.innerHTML = `<h4 class="font-bold text-sm text-slate-800">📁 ${escapeHtml(project.name)}</h4><button type="button" class="text-xs font-semibold text-red-600 hover:text-red-700">Bỏ dự án</button>`;
        heading.querySelector('button').onclick = () => {
            workspacePlanProjectIds = workspacePlanProjectIds.filter(id => id !== projectId);
            renderWorkspacePlanProjectSelect();
            renderWorkspacePlanProjects();
        };
        section.appendChild(heading);

        if (project.tasks.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'text-xs text-slate-500';
            empty.textContent = 'Dự án chưa có công việc.';
            section.appendChild(empty);
        }

        project.tasks.forEach(task => {
            const taskRow = document.createElement('div');
            taskRow.className = 'workspace-plan-task-row border-t border-slate-100';
            const label = document.createElement('label');
            label.className = 'flex items-start gap-2 py-2 text-sm';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'workspace-plan-task mt-0.5 rounded border-slate-300 text-blue-600';
            checkbox.dataset.projectId = String(project.id);
            checkbox.dataset.taskId = String(task.id);
            const existingPlan = plansForDate.find(plan =>
                String(plan.projectId) === String(project.id) && String(plan.taskId) === String(task.id)
            );
            checkbox.checked = Boolean(existingPlan);
            checkbox.disabled = Boolean(existingPlan?.completionLogs?.length);
            const detail = document.createElement('span');
            const progress = existingPlan
                ? getWorkspaceTaskProgressForPlan(existingPlan, task)
                : { targetQuantity: getWorkspaceTaskQuantity(task), completedToday: 0, remainingAtStart: getWorkspaceTaskQuantity(task) };
            detail.innerHTML = `<span class="font-semibold text-slate-700">${escapeHtml(task.title)}</span><span class="block text-xs text-slate-500 mt-1">${escapeHtml(task.priority || 'Bình thường')} · Hôm nay ${progress.completedToday}/${progress.targetQuantity}${getWorkspaceTaskDateRange(task) ? ` · ${escapeHtml(getWorkspaceTaskDateRange(task))}` : ''}${task.note ? ` · ${escapeHtml(task.note)}` : ''}</span>`;
            label.append(checkbox, detail);
            taskRow.appendChild(label);
            taskRow.insertAdjacentHTML('beforeend', renderWorkspacePlanTimeInputs(getWorkspacePlanTime(existingPlan, task)));
            section.appendChild(taskRow);
        });
        container.appendChild(section);
    });
    if (!workspacePlanProjectIds.length) {
        container.innerHTML = '<p class="rounded-lg bg-slate-50 p-4 text-xs text-slate-500">Tìm và thêm dự án để chọn các công việc cần lên lịch cho ngày này.</p>';
    }
}

function saveWorkspaceDayPlan() {
    const checkedTasks = [...document.querySelectorAll('.workspace-plan-task:checked')];
    const selectedPlans = [];
    for (const checkbox of checkedTasks) {
        const timeParts = [...checkbox.closest('.workspace-plan-task-row').querySelectorAll('[data-time-part]')];
        timeParts.forEach(normalizeWorkspaceTimePart);
        if (timeParts.some(input => !validateWorkspaceTimePart(input))) {
            notifyFailure('Lưu kế hoạch thất bại. Vui lòng nhập giờ hợp lệ: giờ từ 00 đến 23, phút từ 00 đến 59.');
            timeParts.find(input => !validateWorkspaceTimePart(input))?.focus();
            return;
        }
        const enteredParts = timeParts.map(input => input.value.trim());
        const hasTime = enteredParts.some(Boolean);
        if (hasTime && enteredParts.some(part => !part)) {
            notifyFailure('Lưu kế hoạch thất bại. Vui lòng nhập đủ giờ bắt đầu và giờ kết thúc, hoặc để trống toàn bộ.');
            timeParts.find(input => !input.value.trim())?.focus();
            return;
        }
        const time = hasTime
            ? `${enteredParts[0]}:${enteredParts[1]} - ${enteredParts[2]}:${enteredParts[3]}`
            : '';
        const startMinutes = Number(enteredParts[0]) * 60 + Number(enteredParts[1]);
        const endMinutes = Number(enteredParts[2]) * 60 + Number(enteredParts[3]);
        if (time && endMinutes <= startMinutes) {
            notifyFailure('Lưu kế hoạch thất bại. Thời gian kết thúc phải sau thời gian bắt đầu trong cùng ngày.');
            timeParts[2].focus();
            return;
        }
        const existing = workspacePlans.find(plan =>
            plan.date === workspacePlanDate &&
            String(plan.projectId) === checkbox.dataset.projectId &&
            String(plan.taskId) === checkbox.dataset.taskId
        );
        selectedPlans.push({
            ...existing,
            id: existing?.id || `${workspacePlanDate}-${checkbox.dataset.projectId}-${checkbox.dataset.taskId}`,
            date: workspacePlanDate,
            projectId: checkbox.dataset.projectId,
            taskId: checkbox.dataset.taskId,
            time,
            done: existing?.done || false,
            completedQty: existing?.completedQty,
            completionLogs: existing?.completionLogs || []
        });
    }
    const savedProgressPlans = workspacePlans.filter(plan =>
        plan.date === workspacePlanDate &&
        plan.completionLogs?.length &&
        !selectedPlans.some(selected =>
            String(selected.projectId) === String(plan.projectId) &&
            String(selected.taskId) === String(plan.taskId)
        )
    );
    workspacePlans = workspacePlans.filter(plan => plan.date !== workspacePlanDate).concat(selectedPlans, savedProgressPlans);
    saveWorkspaceState();
    renderWorkspaceCalendar();
    renderWorkspaceDashboard();
    closeWorkspacePlanModal();
    notifySuccess('Lưu kế hoạch công việc thành công.');
}

// ================= ĐIỀU HƯỚNG GIỮA CÁC TAB =================
function switchTab(tabName) {
    const tabContent = document.getElementById(`content-${tabName}`);
    if (!tabContent) return;
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.side-tab').forEach(btn => {
        btn.classList.remove('bg-brand-600', 'text-white');
        btn.classList.add('text-slate-300');
    });

    tabContent.classList.remove('hidden');
    const activeBtn = document.getElementById(`side-tab-${tabName}`);
    if (activeBtn) {
        activeBtn.classList.add('bg-brand-600', 'text-white');
        activeBtn.classList.remove('text-slate-300');
    }

    if (['dashboard', 'calendar', 'projects'].includes(tabName)) {
        document.getElementById('workspaceMenuContainer').classList.remove('hidden');
        document.getElementById('workspaceMenuArrow').classList.add('rotate-180');
    }

    if (tabName === 'overview') {
        workspaceDashboardDate = localDateString(new Date());
        renderWorkspaceDashboard();
        renderDashboardOverview();
    }
    if (tabName === 'dashboard') {
        renderWorkspaceDashboard();
        void refreshSharedWorkspaceData();
    }
    if (tabName === 'calendar') renderWorkspaceCalendar();
    if (tabName === 'reports') renderWorkspaceReports();
    if (tabName === 'guide') {
        renderGuideWorkflow();
        void refreshSharedWorkspaceData();
    }
    if (tabName === 'settings') renderSettingsControls();
    if (tabName === 'projects') {
        showWorkspaceProjectOverview();
        renderWorkspaceProjects();
    }
    if (tabName === 'transactions') renderBatchTxSheet();
    if (tabName === 'procurement') renderProcurement();
    if (tabName === 'bom') {
        showBOMOverview();
        populateBOMProductSelect();
    }
}

// ================= TAB 1: KHO VẬT TƯ - DANH MỤC, LỌC VÀ HIỂN THỊ =================
function renderSupplierLink(supplierStr) {
    if (!supplierStr) return '-';
    if (supplierStr.startsWith('http://') || supplierStr.startsWith('https://')) {
        return `<a href="${escapeHtml(supplierStr)}" target="_blank" rel="noopener" class="text-brand-600 hover:underline font-semibold flex items-center gap-1"><i class="fa-solid fa-link text-[10px]"></i>  Xem link</a>`;
    }
    return `<span class="text-slate-600">${escapeHtml(supplierStr)}</span>`;
}

const inventoryNameCollator = new Intl.Collator('vi', { sensitivity: 'accent', numeric: true });

function getMaterialCategory(item) {
    if (item?.type === 'tool') return 'tool';
    return MATERIAL_CATEGORY_VALUES.includes(item?.materialCategory)
        ? item.materialCategory
        : 'other';
}

function getMaterialCategoryLabel(category) {
    const labels = {
        other: 'Linh kiện khác',
        passive: 'Linh kiện thụ động',
        sensor: 'Cảm biến',
        board: 'Mạch',
        chip: 'IC/Chip',
        tool: 'Dụng cụ'
    };
    const label = labels[category] || labels.other;
    return TRANSLATION_MAPS[appLanguage][label] || label;
}

function getFilteredInventoryComponents(searchTerm, category) {
    const search = String(searchTerm || '').trim().toLocaleLowerCase('vi');
    return sortInventoryItemsByName(inventoryData.filter(item => {
        const matchesCategory = !category || category === 'all' || getMaterialCategory(item) === category;
        const searchableText = `${item.name || ''} ${item.supplier || ''}`.toLocaleLowerCase('vi');
        return matchesCategory && (!search || searchableText.includes(search));
    }));
}

function sortInventoryItemsByName(items) {
    return [...items].sort((left, right) =>
        inventoryNameCollator.compare(String(left.name || ''), String(right.name || '')) ||
        inventoryNameCollator.compare(getInventoryWarehouseName(left), getInventoryWarehouseName(right)) ||
        String(left.id).localeCompare(String(right.id), 'vi', { numeric: true })
    );
}

function renderInventory() {
    const projectFilter = document.getElementById('inventoryProjectFilter');
    const selectedProjectId = projectFilter?.value || '__all__';
    const categoryFilter = document.getElementById('inventoryCategoryFilter');
    const selectedCategory = categoryFilter?.value || 'all';
    const searchInput = document.getElementById('inventorySearchInput');
    const search = searchInput ? searchInput.value.trim().toLocaleLowerCase('vi') : '';
    const currentFilterKey = `${selectedProjectId}\u0000${selectedCategory}\u0000${search}`;
    if (currentFilterKey !== inventoryFilterKey) {
        inventoryFilterKey = currentFilterKey;
        inventoryCurrentPage = 1;
    }
    const filteredItems = inventoryData.filter(item => {
        const projectMatches = selectedProjectId === '__all__' ||
            (selectedProjectId === '__unassigned__'
                ? !item.projectId && !String(item.projectName || '').trim()
                : selectedProjectId.startsWith('custom:')
                    ? !item.projectId && String(item.projectName || '').trim() === decodeURIComponent(selectedProjectId.slice(7))
                    : String(item.projectId || '') === selectedProjectId);
        const categoryMatches = selectedCategory === 'all' || getMaterialCategory(item) === selectedCategory;
        const searchMatches = !search ||
            String(item.name || '').toLocaleLowerCase('vi').includes(search) ||
            String(item.supplier || '').toLocaleLowerCase('vi').includes(search);
        return projectMatches && categoryMatches && searchMatches;
    });
    const inventoryGroups = new Map();
    filteredItems.forEach(item => {
        const groupKey = [
            String(item.name || '').trim().toLocaleLowerCase('vi'),
            getMaterialCategory(item),
            String(item.unit || '').trim().toLocaleLowerCase('vi')
        ].join('\u0000');
        const group = inventoryGroups.get(groupKey) || {
            item,
            items: [],
            projectNames: [],
            qty: 0,
            totalValue: 0
        };
        const projectName = getInventoryWarehouseName(item);
        group.items.push(item);
        group.qty += Number(item.qty) || 0;
        group.totalValue += (Number(item.qty) || 0) * (Number(item.price) || 0);
        if (!group.projectNames.includes(projectName)) group.projectNames.push(projectName);
        inventoryGroups.set(groupKey, group);
    });
    const visibleItems = sortInventoryItemsByName([...inventoryGroups.values()].map(group => ({
        ...group.item,
        qty: group.qty,
        projectName: group.projectNames.join(' / '),
        inventoryItemIds: group.items.map(item => item.id),
        totalValue: group.totalValue
    })));
    const stockTypeCount = document.getElementById('invStockTypeCount');
    const totalStockQty = document.getElementById('invTotalStockQty');
    const outOfStockCount = document.getElementById('invOutOfStockCount');
    const totalQty = visibleItems.reduce((total, item) => total + (Number(item.qty) || 0), 0);
    const unavailableCount = visibleItems.filter(item => (Number(item.qty) || 0) <= 0).length;
    const pageCount = Math.max(1, Math.ceil(visibleItems.length / INVENTORY_PAGE_SIZE));
    inventoryPageCount = pageCount;
    inventoryCurrentPage = Math.min(inventoryCurrentPage, pageCount);
    const pageItems = visibleItems.slice(
        (inventoryCurrentPage - 1) * INVENTORY_PAGE_SIZE,
        inventoryCurrentPage * INVENTORY_PAGE_SIZE
    );

    if (stockTypeCount) stockTypeCount.textContent = visibleItems.length.toLocaleString('vi-VN');
    if (totalStockQty) totalStockQty.textContent = totalQty.toLocaleString('vi-VN');
    if (outOfStockCount) outOfStockCount.textContent = unavailableCount.toLocaleString('vi-VN');

    const grid = document.getElementById('inventoryCardsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const totalVal = visibleItems.reduce((total, item) => total + (Number(item.totalValue) || 0), 0);
    pageItems.forEach(item => {
        const qty = Number(item.qty) || 0;
        const projectName = item.projectName || 'Dùng chung / Chưa gán dự án';
        const isInStock = qty > 0;
        const category = getMaterialCategory(item);
        const card = document.createElement('article');
        card.className = 'inventory-product-card';
        card.innerHTML = `
            <div class="inventory-product-image-wrap">
                <img src="${escapeHtml(item.imgUrl || DEFAULT_IMG)}" alt="${escapeHtml(item.name)}"
                    class="inventory-product-image">
                <label class="inventory-select-control" title="Chọn ${escapeHtml(item.name)}">
                    <input type="checkbox" value="${escapeHtml(String(item.id))}" class="inv-row-checkbox rounded border-slate-300 text-brand-600">
                    <span class="sr-only">Chọn ${escapeHtml(item.name)}</span>
                </label>
                <span class="inventory-type-badge">${escapeHtml(getMaterialCategoryLabel(category))}</span>
            </div>
            <div class="inventory-product-content">
                <p class="inventory-project-name">
                    <i class="fa-solid fa-folder-open" aria-hidden="true"></i>
                    ${escapeHtml(projectName)}
                </p>
                <h3 class="inventory-product-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h3>
                <div class="inventory-stock-status ${isInStock ? 'is-in-stock' : 'is-out-of-stock'}">
                    <span>${isInStock ? 'Tồn kho' : 'Hết hàng'}</span>
                    <strong>${qty.toLocaleString('vi-VN')} <small>${escapeHtml(item.unit || '')}</small></strong>
                </div>
                <p class="inventory-product-price">${formatCurrency(Number(item.price) || 0)}</p>
                <div class="inventory-product-meta">
                    <span>${renderSupplierLink(item.supplier)}</span>
                    <span>${escapeHtml(item.date || '-')}</span>
                </div>
                <div class="inventory-product-actions no-print">
                    <button type="button" class="inventory-edit-button" title="Sửa ${escapeHtml(item.name)}" aria-label="Sửa ${escapeHtml(item.name)}">
                        <i class="fa-solid fa-pen" aria-hidden="true"></i> Sửa
                    </button>
                    <button type="button" class="inventory-delete-button" title="Xóa ${escapeHtml(item.name)}" aria-label="Xóa ${escapeHtml(item.name)}">
                        <i class="fa-solid fa-trash" aria-hidden="true"></i> Xóa
                    </button>
                </div>
            </div>
        `;
        const productImage = card.querySelector('.inventory-product-image');
        const rowCheckbox = card.querySelector('.inv-row-checkbox');
        rowCheckbox.dataset.inventoryIds = JSON.stringify(item.inventoryItemIds);
        card.querySelector('.inventory-edit-button').addEventListener('click', () => openComponentModal(item.id));
        card.querySelector('.inventory-delete-button').addEventListener('click', () => deleteSingleInventory(item.inventoryItemIds));
        productImage.addEventListener('error', () => {
            productImage.onerror = null;
            productImage.src = DEFAULT_IMG;
        }, { once: true });
        grid.appendChild(card);
    });

    const countText = document.getElementById('invCountText');
    const totalValText = document.getElementById('invTotalValueText');
    if (countText) countText.textContent = `${formatNumber(visibleItems.length)} ${appLanguage === 'en' ? 'items' : 'sản phẩm'}`;
    if (totalValText) totalValText.textContent = `Tổng giá trị kho: ${formatCurrency(totalVal)}`;

    renderInventoryPagination(visibleItems.length);
    const selectAll = document.getElementById('selectAllInv');
    if (selectAll) selectAll.checked = false;

    populateInventoryProjectSelects();
    populateTransactionProjectSelect();
    if (appInitialized) {
        renderDashboardOverview();
        renderWorkspaceReports();
    }
}

function renderInventoryPagination(totalItems) {
    const pagination = document.getElementById('inventoryPagination');
    if (!pagination) return;
    const pageCount = Math.max(1, Math.ceil(totalItems / INVENTORY_PAGE_SIZE));
    const isFirstPage = inventoryCurrentPage === 1;
    const isLastPage = inventoryCurrentPage === pageCount;
    const startItem = totalItems ? (inventoryCurrentPage - 1) * INVENTORY_PAGE_SIZE + 1 : 0;
    const endItem = Math.min(inventoryCurrentPage * INVENTORY_PAGE_SIZE, totalItems);
    pagination.innerHTML = `
        <button type="button" class="inventory-page-link" onclick="changeInventoryPage(1)" ${isFirstPage ? 'disabled' : ''}>
            <i class="fa-solid fa-angles-left" aria-hidden="true"></i><span>Về trang 1</span>
        </button>
        <div class="inventory-page-main-controls">
            <button type="button" class="inventory-page-button inventory-page-button-wide" onclick="changeInventoryPage(${inventoryCurrentPage - 1})" aria-label="Trang trước" ${isFirstPage ? 'disabled' : ''}>
                <i class="fa-solid fa-arrow-left" aria-hidden="true"></i><span>Trang trước</span>
            </button>
            <button type="button" class="inventory-page-button inventory-page-button-next" onclick="changeInventoryPage(${inventoryCurrentPage + 1})" aria-label="Trang sau" ${isLastPage ? 'disabled' : ''}>
                <span>Trang sau</span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </button>
        </div>
        <div class="inventory-page-status">
            <span class="inventory-page-range">${formatNumber(startItem)}–${formatNumber(endItem)} / ${formatNumber(totalItems)}</span>
            <label for="inventoryPageInput">Trang</label>
            <input id="inventoryPageInput" type="number" min="1" max="${pageCount}" value="${inventoryCurrentPage}" aria-label="Số trang kho vật tư" onchange="changeInventoryPageFromInput(this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();changeInventoryPageFromInput(this.value)}">
            <span>trên ${formatNumber(pageCount)}</span>
            <button type="button" class="inventory-page-button inventory-page-compact" onclick="changeInventoryPage(${inventoryCurrentPage - 1})" aria-label="Trang trước" ${isFirstPage ? 'disabled' : ''}><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
            <button type="button" class="inventory-page-button inventory-page-compact" onclick="changeInventoryPage(${inventoryCurrentPage + 1})" aria-label="Trang sau" ${isLastPage ? 'disabled' : ''}><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
        </div>`;
    translateSubtree(pagination);
}

function changeInventoryPageFromInput(value) {
    const page = Number(value);
    if (!Number.isInteger(page) || page < 1 || page > inventoryPageCount) {
        notifyFailure(`Vui lòng chọn số trang từ 1 đến ${inventoryPageCount}.`);
        const input = document.getElementById('inventoryPageInput');
        if (input) input.value = String(inventoryCurrentPage);
        return;
    }
    changeInventoryPage(page);
}

function changeInventoryPage(page) {
    const nextPage = Number(page);
    if (!Number.isInteger(nextPage) || nextPage < 1) return;
    inventoryCurrentPage = Math.min(nextPage, inventoryPageCount);
    renderInventory();
    document.getElementById('inventoryCardsGrid')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function openInventoryImportPicker() {
    const picker = document.getElementById('inventoryImportFile');
    if (!picker) {
        notifyFailure('Không mở được chức năng chọn tệp nhập vật tư.');
        return;
    }
    picker.value = '';
    picker.click();
}

function closeInventoryImportModal() {
    inventoryImportLookupId += 1;
    inventoryImportImageLookupController?.abort();
    inventoryImportImageLookupController = null;
    document.getElementById('inventoryImportModal')?.classList.add('hidden');
    pendingInventoryImport = [];
}

function normalizeInventoryImportHeader(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('vi')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]/g, '');
}

function parseInventoryImportNumber(value, decimalSeparator = '') {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    const text = String(value ?? '').trim().replace(/\s/g, '').replace(/[^\d,.-]/g, '');
    if (!text) return 0;
    const comma = text.lastIndexOf(',');
    const dot = text.lastIndexOf('.');
    let normalized = text;
    if (comma >= 0 && dot >= 0) {
        const decimalSeparator = comma > dot ? ',' : '.';
        const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
        normalized = text.split(thousandsSeparator).join('');
        if (decimalSeparator === ',') normalized = normalized.replace(',', '.');
    } else if (comma >= 0 || dot >= 0) {
        const separator = comma >= 0 ? ',' : '.';
        const decimalPlaces = text.length - text.lastIndexOf(separator) - 1;
        normalized = decimalSeparator === separator
            ? text.replace(separator, '.')
            : decimalPlaces === 3
            ? text.split(separator).join('')
            : text.replace(separator, '.');
    }
    const number = Number(normalized);
    return Number.isFinite(number) ? number : NaN;
}

function parseInventoryImportDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }
    if (typeof value === 'number' && value > 0) {
        const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    }
    const text = String(value || '').trim();
    if (!text) return '';
    let match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    match = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
    return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : '';
}

function parseInventoryCsv(text) {
    const firstLine = String(text).split(/\r\n|\n|\r/, 1)[0] || '';
    const delimiters = [',', ';', '\t'];
    const delimiter = delimiters
        .map(candidate => ({ candidate, count: firstLine.split(candidate).length - 1 }))
        .sort((left, right) => right.count - left.count)[0].candidate;
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    const source = String(text).replace(/^\uFEFF/, '');
    for (let index = 0; index < source.length; index += 1) {
        const character = source[index];
        if (character === '"') {
            if (quoted && source[index + 1] === '"') {
                cell += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (character === delimiter && !quoted) {
            row.push(cell);
            cell = '';
        } else if ((character === '\n' || character === '\r') && !quoted) {
            if (character === '\r' && source[index + 1] === '\n') index += 1;
            row.push(cell);
            if (row.some(value => String(value).trim())) rows.push(row);
            row = [];
            cell = '';
        } else {
            cell += character;
        }
    }
    row.push(cell);
    if (row.some(value => String(value).trim())) rows.push(row);
    return { rows, delimiter };
}

function findInventoryImportColumn(headers, aliases) {
    const normalizedAliases = aliases.map(normalizeInventoryImportHeader);
    return headers.findIndex(header => normalizedAliases.includes(normalizeInventoryImportHeader(header)));
}

function findInventoryImportLinkColumn(headers) {
    const explicitIndex = findInventoryImportColumn(headers, [
        'Link', 'Link mua', 'Link mua hàng', 'Link mua linh kiện', 'Link sản phẩm',
        'Đường dẫn mua', 'URL mua', 'Purchase link', 'Product link', 'Buy link', 'URL'
    ]);
    if (explicitIndex >= 0) return explicitIndex;
    return headers.findIndex(header => {
        const normalized = normalizeInventoryImportHeader(header);
        return (normalized.includes('link') || normalized.includes('url') || normalized.includes('hyperlink')) &&
            ['mua', 'buy', 'purchase', 'sanpham', 'linhkien', 'component', 'product', 'supplier', 'store'].some(part => normalized.includes(part));
    });
}

function getInventoryImportLink(value, worksheet, rowIndex, columnIndex) {
    if (worksheet && columnIndex >= 0 && window.XLSX) {
        const cellAddress = window.XLSX.utils.encode_cell({ r: rowIndex + 1, c: columnIndex });
        const cell = worksheet[cellAddress];
        const target = cell?.l?.Target;
        if (typeof target === 'string' && /^https?:\/\//i.test(target)) return target;
        const formula = String(cell?.f || '');
        const formulaUrl = formula.match(/HYPERLINK\s*\(\s*["'](https?:\/\/[^"']+)/i)?.[1];
        if (formulaUrl) return formulaUrl;
    }
    const text = String(value || '').trim();
    const formulaUrl = text.match(/HYPERLINK\s*\(\s*["'](https?:\/\/[^"']+)/i)?.[1];
    return formulaUrl || text;
}

function normalizeInventoryImageUrl(value) {
    const imageUrl = String(value || '').trim();
    if (!imageUrl) return '';
    try {
        const parsed = new URL(imageUrl);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch {
        return '';
    }
}

function isDirectInventoryImageUrl(value) {
    const imageUrl = normalizeInventoryImageUrl(value);
    if (!imageUrl) return false;
    return /\.(?:avif|gif|jpe?g|png|webp|bmp|svg)$/i.test(new URL(imageUrl).pathname);
}

function isPublicInventoryProductUrl(value) {
    try {
        const url = new URL(String(value || ''));
        if (!['http:', 'https:'].includes(url.protocol)) return false;
        const hostname = url.hostname.toLocaleLowerCase();
        if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) return false;
        if (/^(?:0|10|127|169\.254|192\.168)\./.test(hostname)) return false;
        const private172 = hostname.match(/^172\.(\d+)\./);
        if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false;
        if (hostname === '::1' || hostname === '[::1]' || hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80:') || hostname.startsWith('[fe80:')) return false;
        return true;
    } catch {
        return false;
    }
}

async function fetchInventoryProductImage(productUrl, signal) {
    if (!isPublicInventoryProductUrl(productUrl)) return { imageUrl: '', reason: 'URL không hợp lệ hoặc không công khai' };
    const metadataUrl = new URL('https://api.microlink.io');
    metadataUrl.searchParams.set('url', productUrl);
    const requestController = new AbortController();
    const abortRequest = () => requestController.abort();
    if (signal.aborted) abortRequest();
    signal.addEventListener('abort', abortRequest, { once: true });
    const timeout = window.setTimeout(abortRequest, 15000);
    try {
        const response = await fetch(metadataUrl, { signal: requestController.signal, headers: { Accept: 'application/json' } });
        if (!response.ok) return { imageUrl: '', reason: `Microlink trả về lỗi ${response.status}` };
        const payload = await response.json();
        const imageUrl = normalizeInventoryImageUrl(payload?.data?.image?.url);
        if (payload?.status !== 'success' || !imageUrl) {
            return { imageUrl: '', reason: payload?.status === 'success' ? 'Trang sản phẩm không có ảnh Open Graph' : 'Không đọc được thông tin ảnh sản phẩm' };
        }
        return { imageUrl, reason: '' };
    } catch (error) {
        if (error.name === 'AbortError') return { imageUrl: '', reason: 'Đã hủy tra cứu ảnh' };
        return { imageUrl: '', reason: 'Không kết nối được Microlink' };
    } finally {
        window.clearTimeout(timeout);
        signal.removeEventListener('abort', abortRequest);
    }
}

async function resolveInventoryImportImages(items, requestId) {
    items.forEach(item => {
        item.imgUrl = normalizeInventoryImageUrl(item.imgUrl) ||
            (isDirectInventoryImageUrl(item.supplier) ? normalizeInventoryImageUrl(item.supplier) : '');
    });
    const candidates = items.filter(item =>
        !item.imgUrl &&
        isPublicInventoryProductUrl(item.supplier) &&
        !isDirectInventoryImageUrl(item.supplier)
    );
    if (!candidates.length || !document.getElementById('inventoryImportFindImages').checked) {
        return { found: 0, failed: 0 };
    }

    inventoryImportImageLookupController?.abort();
    inventoryImportImageLookupController = new AbortController();
    const { signal } = inventoryImportImageLookupController;
    const uniqueUrls = [...new Set(candidates.map(item => item.supplier))];
    const imageByUrl = new Map();
    let cursor = 0;
    let completed = 0;
    const summary = document.getElementById('inventoryImportSummary');
    const workers = Array.from({ length: Math.min(3, uniqueUrls.length) }, async () => {
        while (cursor < uniqueUrls.length && !signal.aborted) {
            const url = uniqueUrls[cursor];
            cursor += 1;
            const result = await fetchInventoryProductImage(url, signal);
            imageByUrl.set(url, result);
            completed += 1;
            if (requestId !== inventoryImportLookupId) return;
            summary.textContent = `Đang tìm ảnh sản phẩm: ${completed}/${uniqueUrls.length} link đã kiểm tra...`;
        }
    });
    await Promise.all(workers);
    if (requestId !== inventoryImportLookupId) return { found: 0, failed: 0 };

    let found = 0;
    let failed = 0;
    candidates.forEach(item => {
        const result = imageByUrl.get(item.supplier);
        if (result?.imageUrl) {
            item.imgUrl = result.imageUrl;
            found += 1;
        } else if (result) {
            item.imageLookupError = result.reason;
            failed += 1;
        }
    });
    return { found, failed };
}

function getInventoryImportCategory(value) {
    const category = normalizeInventoryImportHeader(value);
    if (['tool', 'tools', 'dungcu'].includes(category)) return 'tool';
    if (['passive', 'passivecomponents', 'linhkienthudong', 'thudong'].includes(category)) return 'passive';
    if (['sensor', 'sensors', 'cambien'].includes(category)) return 'sensor';
    if (['board', 'boards', 'mach', 'pcb'].includes(category)) return 'board';
    if (['chip', 'ic', 'icchip', 'chipic'].includes(category)) return 'chip';
    return 'other';
}

function getInventoryImportDuplicateKey(item) {
    const projectName = String(item.projectName || getInventoryWarehouseName(item) || 'Dùng chung')
        .trim().toLocaleLowerCase('vi');
    return [
        String(item.name || '').trim().toLocaleLowerCase('vi'),
        getMaterialCategory(item),
        String(item.unit || 'pcs').trim().toLocaleLowerCase('vi'),
        projectName
    ].join('\u0000');
}

async function handleInventoryImportFile(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    inventoryImportImageLookupController?.abort();
    const requestId = ++inventoryImportLookupId;
    const summary = document.getElementById('inventoryImportSummary');
    const preview = document.getElementById('inventoryImportPreviewRows');
    const errorsElement = document.getElementById('inventoryImportErrors');
    const confirmButton = document.getElementById('inventoryImportConfirm');
    document.getElementById('inventoryImportFileName').textContent = file.name;
    summary.textContent = 'Đang đọc bảng tính...';
    preview.innerHTML = '<tr><td colspan="8">Đang đọc dữ liệu...</td></tr>';
    errorsElement.classList.add('hidden');
    confirmButton.disabled = true;
    document.getElementById('inventoryImportModal').classList.remove('hidden');

    try {
        const extension = file.name.split('.').pop().toLocaleLowerCase();
        let rows;
        let decimalSeparator = '';
        let importWorksheet = null;
        if (extension === 'csv') {
            const csv = parseInventoryCsv(await file.text());
            rows = csv.rows;
            decimalSeparator = csv.delimiter === ';' || csv.delimiter === '\t' ? ',' : '.';
        } else if (extension === 'xlsx' || extension === 'xls') {
            if (!window.XLSX) throw new Error('Không tải được bộ đọc Excel. Hãy xuất Google Sheets thành CSV rồi thử lại.');
            const workbook = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
            const sheetName = workbook.SheetNames[0];
            if (!sheetName) throw new Error('Tệp Excel không có trang tính nào để nhập.');
            importWorksheet = workbook.Sheets[sheetName];
            rows = window.XLSX.utils.sheet_to_json(importWorksheet, {
                header: 1,
                defval: '',
                raw: true
            });
        } else {
            throw new Error('Chỉ hỗ trợ tệp CSV, XLSX hoặc XLS.');
        }
        if (!rows?.length || rows.length < 2) throw new Error('Bảng tính cần có hàng tiêu đề và ít nhất một dòng vật tư.');

        const headers = rows[0].map(value => String(value || '').trim());
        const columns = {
            name: findInventoryImportColumn(headers, ['Tên vật tư', 'Tên linh kiện', 'Tên sản phẩm', 'name', 'material', 'component', 'item']),
            quantity: findInventoryImportColumn(headers, ['Tồn kho', 'Số lượng', 'Số lượng tồn', 'quantity', 'qty', 'stock', 'on hand']),
            category: findInventoryImportColumn(headers, ['Loại', 'Nhóm', 'Loại vật tư', 'category', 'material category', 'type']),
            unit: findInventoryImportColumn(headers, ['Đơn vị', 'Đơn vị tính', 'ĐVT', 'unit', 'uom']),
            price: findInventoryImportColumn(headers, ['Đơn giá', 'Giá', 'price', 'unit price', 'cost']),
            supplier: findInventoryImportColumn(headers, ['Cửa hàng', 'Nhà cung cấp', 'Nguồn mua', 'supplier', 'store', 'shop']),
            purchaseLink: findInventoryImportLinkColumn(headers),
            date: findInventoryImportColumn(headers, ['Ngày nhập', 'Ngày mua', 'Ngày', 'date', 'purchase date']),
            project: findInventoryImportColumn(headers, ['Dự án', 'Kho', 'project', 'project name']),
            image: findInventoryImportColumn(headers, ['Hình ảnh', 'Ảnh', 'image', 'image url', 'img url'])
        };
        if (columns.name < 0 || columns.quantity < 0) {
            throw new Error('Không tìm thấy cột bắt buộc. Hãy đặt tên cột là “Tên vật tư” và “Tồn kho” (hoặc “Số lượng”).');
        }

        const imported = [];
        const rowErrors = [];
        rows.slice(1).forEach((sourceRow, index) => {
            if (!sourceRow.some(value => String(value ?? '').trim())) return;
            const rowNumber = index + 2;
            const name = String(sourceRow[columns.name] || '').trim();
            const quantity = parseInventoryImportNumber(sourceRow[columns.quantity]);
            const price = columns.price < 0 ? 0 : parseInventoryImportNumber(sourceRow[columns.price], decimalSeparator);
            const purchaseLink = columns.purchaseLink < 0
                ? ''
                : getInventoryImportLink(sourceRow[columns.purchaseLink], importWorksheet, index, columns.purchaseLink);
            if (!name) {
                rowErrors.push(`Dòng ${rowNumber}: thiếu tên vật tư.`);
                return;
            }
            if (!Number.isInteger(quantity) || quantity < 0) {
                rowErrors.push(`Dòng ${rowNumber}: tồn kho phải là số nguyên từ 0 trở lên.`);
                return;
            }
            if (!Number.isFinite(price) || price < 0) {
                rowErrors.push(`Dòng ${rowNumber}: đơn giá không hợp lệ.`);
                return;
            }
            const materialCategory = columns.category < 0 ? 'other' : getInventoryImportCategory(sourceRow[columns.category]);
            const type = materialCategory === 'tool' ? 'tool' : 'component';
            const projectName = columns.project < 0 ? '' : String(sourceRow[columns.project] || '').trim();
            const linkedProject = workspaceProjects.find(project =>
                project.name.toLocaleLowerCase('vi') === projectName.toLocaleLowerCase('vi')
            );
            imported.push({
                name,
                type,
                materialCategory,
                projectId: linkedProject ? String(linkedProject.id) : '',
                projectName,
                unit: columns.unit < 0 ? 'pcs' : String(sourceRow[columns.unit] || 'pcs').trim(),
                qty: quantity,
                price,
                supplier: purchaseLink || (columns.supplier < 0 ? '' : String(sourceRow[columns.supplier] || '').trim()),
                date: columns.date < 0 ? '' : parseInventoryImportDate(sourceRow[columns.date]),
                imgUrl: columns.image < 0 ? '' : String(sourceRow[columns.image] || '').trim()
            });
        });
        const imageLookup = await resolveInventoryImportImages(imported, requestId);
        if (requestId !== inventoryImportLookupId) return;
        pendingInventoryImport = imported;
        const seenKeys = new Set(inventoryData.map(getInventoryImportDuplicateKey));
        let importableCount = 0;
        let duplicateCount = 0;
        imported.forEach(item => {
            const key = getInventoryImportDuplicateKey(item);
            if (seenKeys.has(key)) {
                duplicateCount += 1;
                return;
            }
            seenKeys.add(key);
            importableCount += 1;
        });
        summary.textContent = `${imported.length} dòng hợp lệ · ${importableCount} vật tư mới · ${duplicateCount} dòng trùng sẽ được bỏ qua${rowErrors.length ? ` · ${rowErrors.length} dòng lỗi` : ''}${imageLookup.found ? ` · Đã tìm được ảnh cho ${imageLookup.found} vật tư` : ''}${imageLookup.failed ? ` · Không tìm thấy ảnh cho ${imageLookup.failed} link` : ''}`;
        if (!imported.length) {
            preview.innerHTML = '<tr><td colspan="8">Không có dòng vật tư hợp lệ để nhập.</td></tr>';
        } else {
            preview.innerHTML = imported.slice(0, 8).map(item =>
                `<tr><td>${item.imgUrl ? `<img class="inventory-import-preview-image" src="${escapeHtml(item.imgUrl)}" alt="" loading="lazy">` : '<span class="inventory-import-no-image"><i class="fa-regular fa-image" aria-hidden="true"></i></span>'}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(getMaterialCategoryLabel(item.materialCategory))}</td><td>${formatNumber(item.qty)}</td><td>${escapeHtml(item.unit)}</td><td>${escapeHtml(formatCurrency(item.price))}</td><td>${renderSupplierLink(item.supplier)}</td><td>${escapeHtml(item.projectName || 'Dùng chung')}</td></tr>`
            ).join('') + (imported.length > 8 ? `<tr><td colspan="8" class="inventory-import-more">Còn ${imported.length - 8} dòng khác…</td></tr>` : '');
        }
        if (rowErrors.length) {
            errorsElement.textContent = `Đã bỏ qua các dòng không hợp lệ: ${rowErrors.slice(0, 5).join(' ')}${rowErrors.length > 5 ? ` Và ${rowErrors.length - 5} lỗi khác.` : ''}`;
            errorsElement.classList.remove('hidden');
        }
        if (imageLookup.failed) {
            const imageWarning = `Không tự tìm được ảnh cho ${imageLookup.failed} link sản phẩm. Bạn vẫn có thể nhập vật tư; có thể thêm cột Hình ảnh vào Sheet để gán ảnh trực tiếp.`;
            errorsElement.textContent = errorsElement.classList.contains('hidden')
                ? imageWarning
                : `${errorsElement.textContent} ${imageWarning}`;
            errorsElement.classList.remove('hidden');
        }
        preview.querySelectorAll('.inventory-import-preview-image').forEach(image => {
            image.addEventListener('error', () => {
                image.src = DEFAULT_IMG;
                image.classList.add('is-fallback');
            }, { once: true });
        });
        confirmButton.disabled = importableCount === 0;
        confirmButton.innerHTML = `<i class="fa-solid fa-file-import" aria-hidden="true"></i> Nhập ${formatNumber(importableCount)} vật tư`;
    } catch (error) {
        pendingInventoryImport = [];
        summary.textContent = 'Không thể đọc tệp này.';
        preview.innerHTML = `<tr><td colspan="8">${escapeHtml(error.message)}</td></tr>`;
        errorsElement.textContent = error.message;
        errorsElement.classList.remove('hidden');
        confirmButton.disabled = true;
        notifyFailure(`Nhập Google Sheets thất bại: ${error.message}`);
    }
}

function importInventoryRows() {
    if (!pendingInventoryImport.length) {
        notifyFailure('Chưa có vật tư hợp lệ để nhập.');
        return;
    }
    const existingKeys = new Set(inventoryData.map(getInventoryImportDuplicateKey));
    const imported = [];
    let nextId = Date.now();
    pendingInventoryImport.forEach(item => {
        const key = getInventoryImportDuplicateKey(item);
        if (existingKeys.has(key)) return;
        while (inventoryData.some(current => String(current.id) === String(nextId)) ||
            imported.some(current => String(current.id) === String(nextId))) nextId += 1;
        imported.push({ ...item, id: nextId });
        nextId += 1;
        existingKeys.add(key);
    });
    if (!imported.length) {
        notifyFailure('Tất cả vật tư trong tệp đã có trong kho; không có dòng nào được nhập.');
        closeInventoryImportModal();
        return;
    }
    inventoryData.unshift(...imported);
    historyLogs.unshift({
        timestamp: new Date().toLocaleDateString('vi-VN') + ' ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        type: 'IN',
        name: `Nhập danh sách (${imported.length} vật tư)`,
        qty: imported.reduce((total, item) => total + item.qty, 0),
        user: 'Admin',
        note: 'Nhập từ Google Sheets'
    });
    saveStateToStorage();
    inventoryCurrentPage = 1;
    inventoryFilterKey = '';
    renderInventory();
    updateDataLists();
    closeInventoryImportModal();
    notifySuccess(`Đã nhập ${formatNumber(imported.length)} vật tư vào kho.`);
}

function populateInventoryProjectSelects() {
    const projectFilter = document.getElementById('inventoryProjectFilter');
    const projectSuggestions = document.getElementById('inventoryProjectSuggestions');
    const projectOptions = workspaceProjects.map(project =>
        `<option value="${escapeHtml(String(project.id))}">${escapeHtml(project.name)}</option>`
    ).join('');
    const customProjectNames = [...new Set(inventoryData
        .filter(item => !item.projectId && String(item.projectName || '').trim())
        .map(item => String(item.projectName).trim())
        .filter(name => !workspaceProjects.some(project =>
            project.name.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi')
        )))];

    if (projectFilter) {
        const selected = projectFilter.value || '__all__';
        const customOptions = customProjectNames.map(name =>
            `<option value="custom:${escapeHtml(encodeURIComponent(name))}">${escapeHtml(name)}</option>`
        ).join('');
        projectFilter.innerHTML = `<option value="__all__">Tất cả dự án</option><option value="__unassigned__">Dùng chung / Chưa gán</option>${projectOptions}${customOptions}`;
        if ([...projectFilter.options].some(option => option.value === selected)) projectFilter.value = selected;
    }
    if (projectSuggestions) {
        projectSuggestions.innerHTML = workspaceProjects.map(project =>
            `<option value="${escapeHtml(project.name)}"></option>`
        ).join('');
    }
}

// ================= MODAL TAB 1: THÊM, SỬA VÀ XÓA VẬT TƯ =================
function openComponentModal(editId = null) {
    const modal = document.getElementById('componentModal');
    const title = document.getElementById('componentModalTitle');
    const form = document.getElementById('componentForm');

    form.reset();
    document.getElementById('compDate').value = new Date().toISOString().split('T')[0];
    populateInventoryProjectSelects();

    if (editId) {
        const item = inventoryData.find(i => i.id === editId);
        if (item) {
            title.textContent = "Chỉnh sửa thông tin linh kiện";
            document.getElementById('compEditId').value = item.id;
            document.getElementById('compName').value = item.name;
            document.getElementById('compType').value = getMaterialCategory(item);
            const project = workspaceProjects.find(projectItem =>
                String(projectItem.id) === String(item.projectId)
            );
            document.getElementById('compProjectName').value = project?.name || item.projectName || '';
            document.getElementById('compUnit').value = item.unit;
            document.getElementById('compQty').value = item.qty;
            document.getElementById('compImgUrl').value = item.imgUrl || '';
            document.getElementById('compPrice').value = formatNumber(item.price);
            document.getElementById('compSupplier').value = item.supplier || '';
            document.getElementById('compDate').value = item.date || new Date().toISOString().split('T')[0];
        }
    } else {
        title.textContent = "Thêm linh kiện mới";
        document.getElementById('compEditId').value = "";
    }

    modal.classList.remove('hidden');
}

function closeComponentModal() {
    document.getElementById('componentModal').classList.add('hidden');
}

function handleSaveComponent(e) {
    e.preventDefault();
    const editId = document.getElementById('compEditId').value;
    const name = document.getElementById('compName').value.trim();
    const materialCategory = document.getElementById('compType').value;
    const type = materialCategory === 'tool' ? 'tool' : 'component';
    const projectName = document.getElementById('compProjectName').value.trim();
    const linkedProject = workspaceProjects.find(project =>
        project.name.toLocaleLowerCase('vi') === projectName.toLocaleLowerCase('vi')
    );
    const projectId = linkedProject ? String(linkedProject.id) : '';
    const unit = document.getElementById('compUnit').value.trim();
    const qty = parseInt(document.getElementById('compQty').value) || 0;
    const imgUrl = document.getElementById('compImgUrl').value.trim();
    const price = parseCurrencyNumber(document.getElementById('compPrice').value);
    const supplier = document.getElementById('compSupplier').value.trim();
    const date = document.getElementById('compDate').value;

    if (editId) {
        const item = inventoryData.find(i => i.id == editId);
        if (item) {
            item.name = name;
            item.type = type;
            item.materialCategory = materialCategory;
            item.projectId = projectId || '';
            item.projectName = projectName;
            item.unit = unit;
            item.qty = qty;
            item.imgUrl = imgUrl;
            item.price = price;
            item.supplier = supplier;
            item.date = date;
        }
    } else {
        const newItem = { id: Date.now(), name, type, materialCategory, projectId: projectId || '', projectName, unit, qty, imgUrl, price, supplier, date };
        inventoryData.unshift(newItem);
        addHistoryLog('IN', name, qty, 'Thêm mới vào kho');
    }

    saveStateToStorage();
    renderInventory();
    updateDataLists();
    closeComponentModal();
    notifySuccess(editId ? 'Cập nhật vật tư thành công.' : 'Thêm vật tư thành công.');
}

function deleteSingleInventory(id) {
    const ids = Array.isArray(id) ? id.map(String) : [String(id)];
    if (confirm(`Bạn có chắc chắn muốn xóa ${ids.length > 1 ? `${ids.length} dòng kho` : 'linh kiện này'} khỏi kho?`)) {
        inventoryData = inventoryData.filter(item => !ids.includes(String(item.id)));
        saveStateToStorage();
        renderInventory();
        notifySuccess(`Đã xóa ${ids.length} dòng kho.`);
    }
}

function deleteSelectedInventory() {
    const checkedBoxes = document.querySelectorAll('.inv-row-checkbox:checked');
    if (checkedBoxes.length === 0) {
        notifyFailure('Xóa vật tư thất bại. Vui lòng tích chọn ít nhất 1 sản phẩm.');
        return;
    }

    if (confirm(`Bạn có chắc muốn xóa ${checkedBoxes.length} linh kiện đã chọn?`)) {
        const idsToDelete = new Set(Array.from(checkedBoxes).flatMap(checkbox =>
            JSON.parse(checkbox.dataset.inventoryIds || `[${JSON.stringify(checkbox.value)}]`).map(String)
        ));
        inventoryData = inventoryData.filter(item => !idsToDelete.has(String(item.id)));
        saveStateToStorage();
        renderInventory();
        notifySuccess(`Đã xóa ${idsToDelete.size} dòng kho.`);
    }
}

function toggleSelectAllInv(master) {
    document.querySelectorAll('#inventoryCardsGrid .inv-row-checkbox').forEach(cb => cb.checked = master.checked);
}

// ================= TAB 2: ĐỊNH MỨC SẢN PHẨM (BOM) =================
function renderBOMProducts() {
    const grid = document.getElementById('bomProductCardsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const count = document.getElementById('bomProductCount');
    if (count) count.textContent = bomProducts.length;

    if (bomProducts.length === 0) {
        grid.innerHTML = `
            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-sm text-slate-500 md:col-span-2">
                Chưa có sản phẩm nào được cấu hình BOM.
            </div>
        `;
        if (appInitialized) {
            renderDashboardOverview();
            renderWorkspaceReports();
        }
        return;
    }

    bomProducts.forEach(prod => {
        let totalBOMCost = 0;
        let itemsListHtml = '';

        prod.items.forEach(bItem => {
            const comp = inventoryData.find(i => i.id === bItem.componentId);
            const name = comp ? comp.name : 'Linh kiện đã xóa';
            const price = comp ? comp.price : 0;
            const subtotal = price * bItem.qtyRequired;
            totalBOMCost += subtotal;

            itemsListHtml += `
                <div class="flex justify-between items-center text-xs py-1 border-b border-slate-100 last:border-0">
                    <span class="text-slate-700 font-medium">• ${escapeHtml(name)} (${bItem.qtyRequired} ${comp ? comp.unit : ''})</span>
                    <span class="text-slate-500">${formatCurrency(subtotal)}</span>
                </div>
            `;
        });

        const card = document.createElement('div');
        card.className = "bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3";
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h3 class="font-bold text-slate-800 text-sm">${escapeHtml(prod.name)}</h3>
                    <p class="text-[11px] text-slate-400">${prod.items.length} cấu phần vật tư</p>
                </div>
                <button type="button" onclick="openBOMModal(${prod.id})" aria-label="Sửa BOM" title="Sửa BOM" class="tab-action-button text-slate-700 bg-slate-100 hover:bg-slate-200">
                    <i class="fa-solid fa-gear mr-1"></i> Sửa BOM
                </button>
            </div>

            <div class="bg-slate-50 p-3 rounded-xl">
                ${itemsListHtml}
            </div>

            <div class="flex justify-between items-center pt-2 text-xs">
                <span class="text-slate-500 font-medium">Chi phí linh kiện / 1 SP:</span>
                <span class="font-bold text-brand-600">${formatCurrency(totalBOMCost)}</span>
            </div>
        `;
        grid.appendChild(card);
    });
    if (appInitialized) {
        renderDashboardOverview();
        renderWorkspaceReports();
    }
}

function showConfiguredBOMProducts() {
    renderBOMProducts();
    document.getElementById('bomOverview').classList.add('hidden');
    document.getElementById('bomProductsView').classList.remove('hidden');
}

function showBOMOverview() {
    const overview = document.getElementById('bomOverview');
    const productsView = document.getElementById('bomProductsView');
    if (!overview || !productsView) return;

    overview.classList.remove('hidden');
    productsView.classList.add('hidden');
}

function populateBOMProductSelect() {
    const select = document.getElementById('bomCalcProductSelect');
    if (!select) return;
    select.innerHTML = '<option value="">-- Chọn sản phẩm --</option>';
    bomProducts.forEach(p => {
        select.innerHTML += `<option value="${p.id}">${escapeHtml(p.name)}</option>`;
    });
}

let currentBOMCalcResults = [];

function calculateBOMRequirements() {
    const prodId = document.getElementById('bomCalcProductSelect').value;
    const multiplier = parseInt(document.getElementById('bomCalcMultiplier').value) || 1;
    const resultArea = document.getElementById('bomCalcResultArea');
    const tbody = document.getElementById('bomCalcTableBody');

    if (!prodId) {
        resultArea.classList.add('hidden');
        return;
    }

    const prod = bomProducts.find(p => p.id == prodId);
    if (!prod) return;

    tbody.innerHTML = '';
    currentBOMCalcResults = [];

    prod.items.forEach((item, index) => {
        const comp = inventoryData.find(i => i.id === item.componentId);
        if (!comp) return;

        const qtyNeeded = item.qtyRequired * multiplier;
        const currentStock = comp.qty;
        const qtyToBuy = Math.max(0, qtyNeeded - currentStock);

        currentBOMCalcResults.push({
            componentId: comp.id,
            qtyToBuy
        });

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="py-2.5 px-4 text-center text-slate-400 font-medium">${index + 1}</td>
            <td class="py-2.5 px-4"><img src="${comp.imgUrl || DEFAULT_IMG}" class="w-7 h-7 rounded object-cover border"></td>
            <td class="py-2.5 px-4 font-semibold text-slate-800">${escapeHtml(comp.name)}</td>
            <td class="py-2.5 px-4 text-center text-slate-500">${escapeHtml(comp.unit)}</td>
            <td class="py-2.5 px-4 text-right font-bold text-slate-800">${qtyNeeded}</td>
            <td class="py-2.5 px-4 text-right font-semibold ${currentStock < qtyNeeded ? 'text-red-500' : 'text-emerald-600'}">${currentStock}</td>
            <td class="py-2.5 px-4 text-right font-bold ${qtyToBuy > 0 ? 'text-amber-600' : 'text-slate-400'}">${qtyToBuy}</td>
            <td class="py-2.5 px-4">${renderSupplierLink(comp.supplier)}</td>
        `;
        tbody.appendChild(tr);
    });

    resultArea.classList.remove('hidden');
}

function addMissingBOMToProcurement() {
    let addedCount = 0;
    currentBOMCalcResults.forEach(res => {
        if (res.qtyToBuy > 0) {
            const existing = procurementList.find(p => p.componentId === res.componentId);
            if (existing) {
                existing.qtyToBuy += res.qtyToBuy;
            } else {
                const comp = inventoryData.find(i => i.id === res.componentId);
                procurementList.push({
                    componentId: res.componentId,
                    qtyToBuy: res.qtyToBuy,
                    price: comp ? comp.price : 0
                });
            }
            addedCount++;
        }
    });

    saveStateToStorage();
    if (addedCount) {
        renderProcurement();
        notifySuccess(`Đã thêm ${addedCount} loại linh kiện còn thiếu vào Danh sách mua hàng.`);
    } else {
        notifyFailure('Không có linh kiện thiếu để thêm vào danh sách mua hàng.');
    }
}

function openBOMModal(editId = null) {
    const modal = document.getElementById('bomModal');
    const title = document.getElementById('bomModalTitle');
    const container = document.getElementById('bomItemsContainer');
    container.innerHTML = '';
    document.getElementById('bomComponentSearch').value = '';
    document.getElementById('bomComponentCategory').value = 'all';

    if (editId) {
        const prod = bomProducts.find(p => p.id === editId);
        if (prod) {
            title.textContent = "Chỉnh sửa BOM Sản Phẩm";
            document.getElementById('bomEditId').value = prod.id;
            document.getElementById('bomProductName').value = prod.name;
            prod.items.forEach(item => addBOMRow(item.componentId, item.qtyRequired));
        }
    } else {
        title.textContent = "Cấu hình BOM Sản Phẩm Mới";
        document.getElementById('bomEditId').value = "";
        document.getElementById('bomProductName').value = "";
        addBOMRow();
    }

    modal.classList.remove('hidden');
}

function closeBOMModal() {
    document.getElementById('bomModal').classList.add('hidden');
}

function addBOMRow(selectedCompId = '', qty = 1) {
    const container = document.getElementById('bomItemsContainer');
    const rowId = Date.now() + Math.random();

    const row = document.createElement('div');
    row.id = `bom-row-${rowId}`;
    row.className = "flex items-center gap-2";
    row.innerHTML = `
        <select class="bom-comp-select flex-1 p-2 border border-slate-200 rounded-lg text-xs">
        </select>
        <input type="number" min="1" value="${qty}" class="bom-qty-input w-20 p-2 border border-slate-200 rounded-lg text-xs text-center" placeholder="SL">
        <button type="button" onclick="document.getElementById('bom-row-${rowId}').remove()" class="text-slate-400 hover:text-red-500 p-2">
            <i class="fa-solid fa-trash"></i>
        </button>
    `;
    container.appendChild(row);
    row.querySelector('.bom-comp-select').dataset.selectedComponentId = String(selectedCompId);
    filterBOMComponentOptions();
}

function filterBOMComponentOptions() {
    const search = document.getElementById('bomComponentSearch')?.value || '';
    const category = document.getElementById('bomComponentCategory')?.value || 'all';
    document.querySelectorAll('#bomItemsContainer .bom-comp-select').forEach(select => {
        const selectedId = select.dataset.initialized === 'true'
            ? select.value
            : select.dataset.selectedComponentId || '';
        const visibleItems = getFilteredInventoryComponents(search, category);
        const selectedItem = inventoryData.find(item => String(item.id) === String(selectedId));
        if (selectedItem && !visibleItems.some(item => String(item.id) === String(selectedItem.id))) {
            visibleItems.unshift(selectedItem);
        }

        select.innerHTML = '<option value="">-- Chọn linh kiện --</option>' + visibleItems.map(item =>
            `<option value="${escapeHtml(String(item.id))}">${escapeHtml(item.name)} · ${escapeHtml(getMaterialCategoryLabel(getMaterialCategory(item)))}</option>`
        ).join('');
        if (selectedId) select.value = String(selectedId);
        select.dataset.initialized = 'true';
    });
}

function saveBOMProduct() {
    const editId = document.getElementById('bomEditId').value;
    const name = document.getElementById('bomProductName').value.trim();

    if (!name) {
        notifyFailure('Lưu BOM thất bại. Vui lòng nhập tên sản phẩm.');
        return;
    }

    const itemRows = document.querySelectorAll('#bomItemsContainer > div');
    const items = [];

    itemRows.forEach(row => {
        const compId = row.querySelector('.bom-comp-select').value;
        const qty = parseInt(row.querySelector('.bom-qty-input').value) || 1;
        if (compId) {
            items.push({ componentId: parseInt(compId), qtyRequired: qty });
        }
    });

    if (editId) {
        const prod = bomProducts.find(p => p.id == editId);
        if (prod) {
            prod.name = name;
            prod.items = items;
        }
    } else {
        bomProducts.push({ id: Date.now(), name, items });
    }

    saveStateToStorage();
    renderBOMProducts();
    closeBOMModal();
    notifySuccess(editId ? 'Cập nhật cấu hình BOM thành công.' : 'Thêm cấu hình BOM thành công.');
}

function populateTransactionProjectSelect() {
    const select = document.getElementById('transactionProject');
    if (!select) return;
    const selected = select.value;
    const workspaceOptions = workspaceProjects.map(project =>
            `<option value="${escapeHtml(String(project.id))}">${escapeHtml(project.name)}</option>`
        ).join('');
    const customProjectNames = [...new Set(inventoryData
        .filter(item => !item.projectId && String(item.projectName || '').trim())
        .map(item => String(item.projectName).trim())
        .filter(name => !workspaceProjects.some(project =>
            project.name.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi')
        )))];
    const customOptions = customProjectNames.map(name =>
        `<option value="custom:${escapeHtml(encodeURIComponent(name))}">${escapeHtml(name)}</option>`
    ).join('');
    select.innerHTML = '<option value="">Chọn dự án</option><option value="__custom__">Tất cả</option>' + workspaceOptions + customOptions;
    if ([...select.options].some(option => option.value === selected)) select.value = selected;
}

function initializeTransactionReceiptFields() {
    const actor = document.getElementById('transactionActor');
    const actorName = document.getElementById('currentUserDisplay')?.textContent.trim();
    if (actor && !actor.value.trim()) actor.value = actorName || activeUserName || 'Naphutech Admin';

    const dateInput = document.getElementById('transactionDate');
    if (dateInput) {
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        dateInput.value = new Date(now.getTime() - offset).toISOString().slice(0, 16);
    }
}

function getTransactionProject(projectId = document.getElementById('transactionProject')?.value || '') {
    if (projectId === '__custom__') return { id: '__custom__', name: 'Tất cả', tasks: [] };
    const workspaceProject = workspaceProjects.find(project => String(project.id) === projectId);
    if (workspaceProject) return workspaceProject;
    if (projectId.startsWith('custom:')) {
        const name = decodeURIComponent(projectId.slice(7));
        return { id: projectId, name, tasks: [] };
    }
    return null;
}

function getInventoryWarehouseName(item) {
    const project = workspaceProjects.find(projectItem => String(projectItem.id) === String(item.projectId));
    return project?.name || item.projectName || 'Dùng chung';
}

function getInventoryItemsForTransactionProject(projectId) {
    if (!projectId) return [];
    if (String(projectId) === '__custom__') return inventoryData;
    const project = getTransactionProject(String(projectId));
    if (!project) return [];
    const projectName = project.name.toLocaleLowerCase('vi');
    return inventoryData.filter(item => {
        const itemProjectName = String(item.projectName || '').trim().toLocaleLowerCase('vi');
        const belongsToSelectedProject =
            String(item.projectId || '') === String(projectId) ||
            (!item.projectId && itemProjectName === projectName);
        const isShared = !item.projectId && !itemProjectName;
        return belongsToSelectedProject || isShared;
    });
}

function handleTransactionProjectChange() {
    const project = getTransactionProject();
    const hint = document.getElementById('transactionProjectStockHint');
    if (hint) {
        hint.textContent = project?.id === '__custom__'
            ? 'Chọn một dự án/kho cụ thể để lập phiếu. Sheet chỉ gồm linh kiện đã thêm từ toàn bộ kho vật tư.'
            : project
                ? `Phiếu sẽ cập nhật kho ${project.name}; danh sách linh kiện bên dưới không đổi khi chuyển dự án.`
                : 'Thêm linh kiện từ toàn bộ kho vật tư vào sheet. Chọn dự án/kho làm nơi nhận hoặc xuất khi lập phiếu.';
    }
    renderBatchTxSheet();
}

function openProductExportModal() {
    const projectSelect = document.getElementById('productExportProject');
    const selectedProjectId = document.getElementById('transactionProject')?.value || '';
    const workspaceOptions = workspaceProjects.map(project =>
        `<option value="${escapeHtml(String(project.id))}">${escapeHtml(project.name)}</option>`
    ).join('');
    const customProjectNames = [...new Set(inventoryData
        .filter(item => !item.projectId && String(item.projectName || '').trim())
        .map(item => String(item.projectName).trim())
        .filter(name => !workspaceProjects.some(project =>
            project.name.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi')
        )))];
    const customOptions = customProjectNames.map(name =>
        `<option value="custom:${escapeHtml(encodeURIComponent(name))}">${escapeHtml(name)}</option>`
    ).join('');
    projectSelect.innerHTML = '<option value="">Chọn dự án/kho</option>' + workspaceOptions + customOptions;
    if ([...projectSelect.options].some(option => option.value === selectedProjectId)) {
        projectSelect.value = selectedProjectId;
    }

    const productSelect = document.getElementById('productExportProduct');
    productSelect.innerHTML = '<option value="">Chọn sản phẩm</option>' + bomProducts.map(product =>
        `<option value="${escapeHtml(String(product.id))}">${escapeHtml(product.name)}</option>`
    ).join('');
    document.getElementById('productExportQuantity').value = '1';
    document.getElementById('productExportActor').value =
        document.getElementById('currentUserDisplay')?.textContent.trim() || activeUserName || 'Naphutech Admin';
    document.getElementById('productExportLocation').value = '';
    document.getElementById('productExportReason').value = '';
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    document.getElementById('productExportDate').value = new Date(now.getTime() - offset).toISOString().slice(0, 16);
    document.getElementById('productExportRequirementsBody').innerHTML =
        '<tr><td colspan="5" class="px-3 py-6 text-center text-slate-500">Chọn dự án/kho và sản phẩm để xem linh kiện cần xuất.</td></tr>';
    renderProductExportRequirements();
    document.getElementById('productExportModal').classList.remove('hidden');
}

function closeProductExportModal() {
    document.getElementById('productExportModal').classList.add('hidden');
    closeProductExportShortage();
}

function closeProductExportShortage() {
    document.getElementById('productExportShortageModal').classList.add('hidden');
    window.productExportShortages = [];
}

function cancelProductExportShortage() {
    closeProductExportShortage();
}

function addProductExportShortagesToProcurement() {
    const shortages = window.productExportShortages || [];
    if (!shortages.length) {
        notifyFailure('Không thể thêm danh sách mua. Không có dữ liệu linh kiện còn thiếu.');
        return;
    }
    shortages.forEach(shortage => addComponentToProcurement(shortage.componentId, shortage.quantity));
    saveStateToStorage();
    renderProcurement();
    closeProductExportShortage();
    closeProductExportModal();
    switchTab('procurement');
    notifySuccess(`Đã thêm ${shortages.length} linh kiện còn thiếu vào Danh Sách Mua.`);
}

function buildProductExportPlan(projectId, productId, productQuantity) {
    const project = getTransactionProject(projectId);
    const product = bomProducts.find(item => String(item.id) === String(productId));
    if (!project || project.id === '__custom__' || !product || !product.items?.length ||
        !Number.isInteger(productQuantity) || productQuantity < 1) {
        return null;
    }

    const availableItems = getInventoryItemsForTransactionProject(projectId);
    const remainingByStockId = new Map(availableItems.map(item => [
        String(item.id),
        Math.max(0, Number(item.qty) || 0)
    ]));
    const components = [];

    product.items.forEach(bomItem => {
        const component = inventoryData.find(item => String(item.id) === String(bomItem.componentId));
        const required = Number(bomItem.qtyRequired) * productQuantity;
        if (!component || !Number.isInteger(Number(bomItem.qtyRequired)) || Number(bomItem.qtyRequired) < 1) {
            components.push({ component, required, allocations: [], available: 0, isValid: false });
            return;
        }

        const componentName = String(component.name || '').trim().toLocaleLowerCase('vi');
        const componentType = component.type === 'tool' ? 'tool' : 'component';
        const candidates = availableItems.filter(item =>
            String(item.name || '').trim().toLocaleLowerCase('vi') === componentName &&
            (item.type === 'tool' ? 'tool' : 'component') === componentType
        ).sort((left, right) => {
            const priority = item => {
                if (String(item.projectId || '') === String(projectId)) return 0;
                if (!item.projectId && String(item.projectName || '').trim().toLocaleLowerCase('vi') === project.name.toLocaleLowerCase('vi')) return 1;
                return 2;
            };
            return priority(left) - priority(right);
        });

        let remaining = required;
        let available = 0;
        const allocations = [];
        candidates.forEach(item => {
            const stockId = String(item.id);
            const stockAvailable = remainingByStockId.get(stockId) || 0;
            available += stockAvailable;
            const quantity = Math.min(stockAvailable, remaining);
            if (quantity > 0) {
                allocations.push({ item, quantity });
                remainingByStockId.set(stockId, stockAvailable - quantity);
                remaining -= quantity;
            }
        });
        components.push({ component, required, allocations, available, isValid: true });
    });

    return { project, product, components };
}

function renderProductExportRequirements() {
    const tbody = document.getElementById('productExportRequirementsBody');
    if (!tbody) return;
    const projectId = document.getElementById('productExportProject')?.value || '';
    const productId = document.getElementById('productExportProduct')?.value || '';
    const quantity = Number(document.getElementById('productExportQuantity')?.value);
    const plan = buildProductExportPlan(projectId, productId, quantity);
    if (!plan) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-3 py-6 text-center text-slate-500">Chọn dự án/kho, sản phẩm hợp lệ và số lượng sản phẩm lớn hơn 0.</td></tr>';
        return;
    }

    const rows = [];
    plan.components.forEach(entry => {
        const componentName = escapeHtml(entry.component?.name || 'Linh kiện không xác định');
        const unit = escapeHtml(entry.component?.unit || '');
        if (!entry.isValid) {
            rows.push(`<tr><td class="px-3 py-2 font-semibold">${componentName}</td><td class="px-3 py-2 text-red-600" colspan="4">Định mức BOM không hợp lệ.</td></tr>`);
            return;
        }
        if (!entry.allocations.length) {
            rows.push(`<tr><td class="px-3 py-2 font-semibold">${componentName}</td><td class="px-3 py-2 text-slate-500">-</td><td class="px-3 py-2 text-center">${unit}</td><td class="px-3 py-2 text-right">${entry.available.toLocaleString('vi-VN')}</td><td class="px-3 py-2 text-right text-red-600">${entry.required.toLocaleString('vi-VN')} · Không đủ kho</td></tr>`);
            return;
        }
        entry.allocations.forEach(({ item, quantity: allocated }) => {
            const projectName = getInventoryWarehouseName(item);
            rows.push(`<tr><td class="px-3 py-2 font-semibold">${componentName}</td><td class="px-3 py-2">${escapeHtml(projectName)}</td><td class="px-3 py-2 text-center">${escapeHtml(item.unit || unit)}</td><td class="px-3 py-2 text-right">${(Number(item.qty) || 0).toLocaleString('vi-VN')}</td><td class="px-3 py-2 text-right">${allocated.toLocaleString('vi-VN')}</td></tr>`);
        });
        const allocatedTotal = entry.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
        if (allocatedTotal < entry.required) {
            rows.push(`<tr><td class="px-3 py-2 font-semibold">${componentName}</td><td class="px-3 py-2 text-slate-500">-</td><td class="px-3 py-2 text-center">${unit}</td><td class="px-3 py-2 text-right">${entry.available.toLocaleString('vi-VN')}</td><td class="px-3 py-2 text-right text-red-600">${(entry.required - allocatedTotal).toLocaleString('vi-VN')} còn thiếu</td></tr>`);
        }
    });
    tbody.innerHTML = rows.length
        ? rows.join('')
        : '<tr><td colspan="5" class="px-3 py-6 text-center text-slate-500">Sản phẩm chưa có định mức linh kiện.</td></tr>';
}

function executeProductExport() {
    const dateValue = document.getElementById('productExportDate').value;
    const actor = document.getElementById('productExportActor').value.trim();
    const projectId = document.getElementById('productExportProject').value;
    const location = document.getElementById('productExportLocation').value.trim();
    const reason = document.getElementById('productExportReason').value.trim();
    const productId = document.getElementById('productExportProduct').value;
    const quantity = Number(document.getElementById('productExportQuantity').value);

    if (!dateValue || !actor || !projectId || !productId) {
        notifyFailure('Xuất theo sản phẩm thất bại. Vui lòng nhập đầy đủ thời gian, người làm phiếu, dự án/kho và sản phẩm.');
        return;
    }
    const createdAt = new Date(dateValue);
    if (Number.isNaN(createdAt.getTime())) {
        notifyFailure('Xuất theo sản phẩm thất bại. Thời gian lập phiếu không hợp lệ.');
        return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
        notifyFailure('Xuất theo sản phẩm thất bại. Số lượng sản phẩm phải là số nguyên lớn hơn 0.');
        return;
    }

    const plan = buildProductExportPlan(projectId, productId, quantity);
    if (!plan) {
        notifyFailure('Xuất theo sản phẩm thất bại. Sản phẩm chưa có định mức BOM hợp lệ hoặc dự án/kho không hợp lệ.');
        return;
    }
    const invalidComponent = plan.components.find(component => !component.isValid);
    if (invalidComponent) {
        notifyFailure(`Xuất theo sản phẩm thất bại. Định mức của "${invalidComponent.component?.name || 'linh kiện'}" không hợp lệ.`);
        return;
    }
    const shortages = plan.components.map(component => ({
        componentId: component.component?.id,
        name: component.component?.name || 'Linh kiện',
        quantity: component.required - component.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0)
    })).filter(shortage => shortage.componentId !== undefined && shortage.componentId !== null && shortage.quantity > 0);
    if (shortages.length) {
        window.productExportShortages = shortages;
        document.getElementById('productExportShortageList').innerHTML = shortages.map(shortage =>
            `<p class="flex items-center justify-between gap-3"><span>${escapeHtml(shortage.name)}</span><strong class="whitespace-nowrap">${shortage.quantity.toLocaleString('vi-VN')} cần mua</strong></p>`
        ).join('');
        document.getElementById('productExportShortageModal').classList.remove('hidden');
        return;
    }

    const quantitiesByStockId = new Map();
    plan.components.forEach(component => component.allocations.forEach(({ item, quantity: allocated }) => {
        const stockId = String(item.id);
        quantitiesByStockId.set(stockId, (quantitiesByStockId.get(stockId) || 0) + allocated);
    }));
    const transactionItems = [...quantitiesByStockId].map(([stockId, itemQuantity]) => ({
        item: inventoryData.find(item => String(item.id) === stockId),
        quantity: itemQuantity
    }));
    if (transactionItems.some(entry => !entry.item || Number(entry.item.qty) < entry.quantity)) {
        notifyFailure('Xuất theo sản phẩm thất bại. Tồn kho đã thay đổi, vui lòng kiểm tra lại định mức và tồn kho.');
        return;
    }

    const receiptNo = `PXN-${createdAt.getFullYear()}${String(createdAt.getMonth() + 1).padStart(2, '0')}${String(createdAt.getDate()).padStart(2, '0')}-${Date.now().toString().slice(-6)}`;
    const receipt = {
        receiptNo,
        type: 'OUT',
        createdAt,
        actor,
        projectName: plan.project.name,
        reason: [reason, `Xuất theo sản phẩm: ${plan.product.name} x${quantity}`].filter(Boolean).join(' · '),
        location,
        items: transactionItems.map(({ item, quantity: itemQuantity }) => ({
            id: item.id,
            name: item.name,
            imgUrl: item.imgUrl || '',
            type: item.type === 'tool' ? 'Dụng cụ' : 'Linh kiện',
            projectName: getInventoryWarehouseName(item),
            unit: item.unit,
            quantity: itemQuantity,
            price: Number(item.price) || 0,
            supplier: item.supplier || ''
        }))
    };
    const historyNote = getTransactionReceiptHistoryNote(receipt);
    transactionItems.forEach(({ item, quantity: itemQuantity }) => {
        item.qty = Number(item.qty) - itemQuantity;
        historyLogs.unshift({
            timestamp: createdAt.toLocaleDateString('vi-VN') + ' ' + createdAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
            type: 'OUT',
            name: item.name,
            qty: itemQuantity,
            user: actor,
            note: historyNote,
            receiptNo,
            project: plan.project.name,
            location
        });
    });

    transactionReceipts.unshift(receipt);
    saveStateToStorage();
    renderInventory();
    renderBatchTxSheet();
    renderHistory();
    closeProductExportModal();
    renderTransactionReceipt(receipt);
    document.getElementById('transactionReceiptModal').classList.remove('hidden');
    notifySuccess(`Xuất theo sản phẩm "${plan.product.name}" thành công. Đã tạo phiếu ${receiptNo}.`);
}

function openTransactionComponentPicker() {
    window.transactionComponentPickerSelection = new Map();
    const searchInput = document.getElementById('transactionComponentSearch');
    if (searchInput) searchInput.value = '';
    const categoryFilter = document.getElementById('transactionComponentCategory');
    if (categoryFilter) categoryFilter.value = 'all';
    renderTransactionComponentPicker();
    document.getElementById('transactionComponentPickerModal').classList.remove('hidden');
}

function closeTransactionComponentPicker() {
    document.getElementById('transactionComponentPickerModal').classList.add('hidden');
}

function renderTransactionComponentPicker() {
    const tbody = document.getElementById('transactionComponentPickerBody');
    if (!tbody) return;
    if (!window.transactionComponentPickerSelection) window.transactionComponentPickerSelection = new Map();
    const selections = window.transactionComponentPickerSelection;
    const search = (document.getElementById('transactionComponentSearch')?.value || '').trim().toLocaleLowerCase('vi');
    const category = document.getElementById('transactionComponentCategory')?.value || 'all';
    const items = getFilteredInventoryComponents(search, category);
    tbody.innerHTML = '';
    items.forEach(item => {
        const id = String(item.id);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-3 py-2 text-center">
                <input type="checkbox" value="${escapeHtml(id)}" class="transaction-component-picker-checkbox rounded border-slate-300 text-brand-600" ${selections.has(id) ? 'checked' : ''}>
            </td>
            <td class="px-3 py-2 font-semibold text-slate-800">${escapeHtml(item.name || '')}</td>
            <td class="px-3 py-2 text-center text-slate-500">${escapeHtml(item.unit || '')}</td>
            <td class="px-3 py-2 text-right">${Number(item.qty) || 0}</td>
            <td class="px-3 py-2 text-center">
                <input type="number" min="1" step="1" value="${escapeHtml(selections.get(id)?.qty || '1')}" data-item-id="${escapeHtml(id)}" class="transaction-component-picker-qty w-20 rounded border border-slate-200 p-1 text-center">
            </td>
        `;
        row.querySelector('.transaction-component-picker-checkbox').addEventListener('change', event => {
            const selected = event.currentTarget.checked;
            const quantity = row.querySelector('.transaction-component-picker-qty').value;
            if (selected) selections.set(id, { qty: quantity });
            else selections.delete(id);
        });
        row.querySelector('.transaction-component-picker-qty').addEventListener('input', event => {
            if (selections.has(id)) selections.set(id, { qty: event.currentTarget.value });
        });
        tbody.appendChild(row);
    });
    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-3 py-6 text-center text-slate-500">Không tìm thấy linh kiện phù hợp trong kho.</td></tr>';
    }
}

function addSelectedComponentsToTransactionSheet() {
    const selections = window.transactionComponentPickerSelection || new Map();
    if (!selections.size) {
        notifyFailure('Thêm linh kiện thất bại. Vui lòng tích chọn ít nhất một linh kiện.');
        return;
    }
    const itemsToAdd = [];
    for (const [itemId, selection] of selections) {
        const item = inventoryData.find(inventoryItem => String(inventoryItem.id) === itemId);
        const quantity = Number(selection.qty);
        if (!item) {
            notifyFailure('Thêm linh kiện thất bại. Có linh kiện không còn trong kho vật tư.');
            return;
        }
        if (!Number.isInteger(quantity) || quantity < 1) {
            notifyFailure(`Thêm linh kiện thất bại. Số lượng của "${item.name}" phải là số nguyên lớn hơn 0.`);
            return;
        }
        itemsToAdd.push({ itemId, quantity });
    }

    if (!window.batchTxState) window.batchTxState = {};
    itemsToAdd.forEach(({ itemId, quantity }) => {
        const existing = window.batchTxState[itemId];
        window.batchTxState[itemId] = {
            qty: (Number(existing?.qty) || 0) + quantity,
            checked: true
        };
    });
    if (!window.batchTxExcludedItems) window.batchTxExcludedItems = {};
    itemsToAdd.forEach(({ itemId }) => delete window.batchTxExcludedItems[itemId]);
    renderBatchTxSheet();
    closeTransactionComponentPicker();
    notifySuccess(`Đã thêm ${itemsToAdd.length} linh kiện vào sheet xuất/nhập.`);
}

window.batchTxState = window.batchTxState || {};
window.batchTxExcludedItems = window.batchTxExcludedItems || {};

// ================= TAB 3: SHEET CHỌN VẬT TƯ XUẤT / NHẬP =================
function renderBatchTxSheet() {
    const tbody = document.getElementById('batchTxTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!window.batchTxState) window.batchTxState = {};
    if (!window.batchTxExcludedItems) window.batchTxExcludedItems = {};
    if (typeof inventoryData === 'undefined' || !Array.isArray(inventoryData)) return;

    const sheetItems = sortInventoryItemsByName(Object.keys(window.batchTxState)
        .filter(itemId => !window.batchTxExcludedItems[itemId])
        .map(itemId => inventoryData.find(item => String(item.id) === String(itemId)))
        .filter(Boolean));
    sheetItems.forEach((item, index) => {
        const itemKey = String(item.id);
        const state = window.batchTxState[itemKey];
        const savedQty = state ? state.qty : 1;
        const savedChecked = state ? state.checked : false;

        const defaultImg = typeof DEFAULT_IMG !== 'undefined' ? DEFAULT_IMG : '';
        const itemName = typeof escapeHtml === 'function' ? escapeHtml(item.name) : item.name;
        const itemUnit = typeof escapeHtml === 'function' ? escapeHtml(item.unit) : item.unit;
        const supplierHtml = typeof renderSupplierLink === 'function' ? renderSupplierLink(item.supplier) : (item.supplier || '');
        const unitPrice = Number(item.price) || 0;

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50";
        tr.innerHTML = `
            <td class="py-2.5 px-4 text-center">
                <input type="checkbox" value="${item.id}" 
                       ${savedChecked ? 'checked' : ''} 
                       onchange="updateBatchTxState('${item.id}')"
                       class="tx-sheet-checkbox rounded border-slate-300 text-brand-600">
            </td>
            <td class="py-2.5 px-4 text-center text-slate-400 font-medium">${index + 1}</td>
            <td class="py-2.5 px-4"><img src="${item.imgUrl || defaultImg}" class="w-7 h-7 rounded border object-cover"></td>
            <td class="py-2.5 px-4 font-semibold text-slate-800">${itemName}<span class="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">${item.type === 'tool' ? 'Dụng cụ' : 'Linh kiện'}</span></td>
            <td class="py-2.5 px-4 text-center text-slate-500">${itemUnit}</td>
            <td class="py-2.5 px-4 text-right font-bold text-slate-700">${item.qty}</td>
            <td class="py-2.5 px-4 text-center">
                <input type="number" id="tx-qty-${item.id}" min="1" value="${savedQty}" 
                       onchange="updateBatchTxState('${item.id}')"
                       oninput="updateBatchTxState('${item.id}')"
                       class="w-20 p-1 border border-slate-200 rounded text-center text-xs font-bold">
            </td>
            <td class="py-2.5 px-4 text-right">${formatCurrency(unitPrice)}</td>
            <td id="tx-total-${item.id}" class="py-2.5 px-4 text-right font-semibold">${formatCurrency(unitPrice * savedQty)}</td>
            <td class="py-2.5 px-4">${supplierHtml}</td>
            <td class="py-2.5 px-4 text-center">
                <button type="button" onclick="removeFromBatchTxSheet('${item.id}')" title="Xóa" aria-label="Xóa ${itemName} khỏi sheet" class="text-slate-400 hover:text-red-600 p-1 transition-colors">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (!tbody.children.length) {
        tbody.innerHTML = '<tr><td colspan="11" class="px-4 py-8 text-center text-xs text-slate-500">Chưa có linh kiện trong sheet. Chọn dự án/kho rồi nhấn “Thêm linh kiện”.</td></tr>';
    }

    syncSelectAllTxSheet();
}

function removeFromBatchTxSheet(id) {
    const itemKey = String(id);
    if (!window.batchTxExcludedItems) window.batchTxExcludedItems = {};

    window.batchTxExcludedItems[itemKey] = true;
    delete window.batchTxState[itemKey];
    renderBatchTxSheet();
}

function syncSelectAllTxSheet() {
    const masterCheckbox = document.getElementById('selectAllTxSheet');
    if (!masterCheckbox) return;

    const checkboxes = Array.from(document.querySelectorAll('.tx-sheet-checkbox'));
    const checkedCount = checkboxes.filter(checkbox => checkbox.checked).length;
    masterCheckbox.checked = checkboxes.length > 0 && checkedCount === checkboxes.length;
    masterCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
    masterCheckbox.disabled = checkboxes.length === 0;
}

function toggleSelectAllTxSheet(masterCheckbox) {
    if (!window.batchTxState) window.batchTxState = {};
    document.querySelectorAll('.tx-sheet-checkbox').forEach(checkbox => {
        checkbox.checked = masterCheckbox.checked;

        const itemKey = String(checkbox.value);
        const qtyInput = document.getElementById(`tx-qty-${itemKey}`);
        const qty = parseInt(qtyInput ? qtyInput.value : '1') || 1;
        if (checkbox.checked) {
            window.batchTxState[itemKey] = {
                qty,
                checked: true
            };
        } else {
            const existing = window.batchTxState[itemKey];
            if (existing) existing.checked = false;
        }
    });

    syncSelectAllTxSheet();
}

// ================= TAB 3: CẬP NHẬT LỰA CHỌN VÀ SỐ LƯỢNG =================
function updateBatchTxState(id) {
    const itemKey = String(id);
    const qtyInput = document.getElementById(`tx-qty-${itemKey}`);
    const checkbox = document.querySelector(`.tx-sheet-checkbox[value="${itemKey}"]`);

    const isChecked = checkbox ? checkbox.checked : false;
    const currentQty = parseInt(qtyInput ? qtyInput.value : 1) || 1;

    if (!window.batchTxState) window.batchTxState = {};
    if (isChecked) {
        window.batchTxState[itemKey] = {
            qty: currentQty,
            checked: true
        };
    } else {
        if (window.batchTxState[itemKey]) {
            window.batchTxState[itemKey].checked = false;
            window.batchTxState[itemKey].qty = currentQty;
        }
    }

    const item = inventoryData.find(inventoryItem => String(inventoryItem.id) === itemKey);
    const totalCell = document.getElementById(`tx-total-${itemKey}`);
    if (item && totalCell) totalCell.textContent = formatCurrency((Number(item.price) || 0) * currentQty);
    syncSelectAllTxSheet();
}

// ================= TAB 3: XÁC NHẬN GIAO DỊCH VÀ CẬP NHẬT TỒN KHO =================
function executeBatchTransaction(type) {
    initializeTransactionReceiptFields();
    const checked = document.querySelectorAll('.tx-sheet-checkbox:checked');
    if (checked.length === 0) {
        notifyFailure(`${type === 'IN' ? 'Nhập' : 'Xuất'} kho thất bại. Vui lòng chọn ít nhất 1 linh kiện trên sheet.`);
        return;
    }

    const actor = document.getElementById('transactionActor').value.trim();
    const project = getTransactionProject();
    const reason = document.getElementById('transactionReason').value.trim();
    const location = document.getElementById('transactionLocation').value.trim();
    if (!actor || !project || project.id === '__custom__') {
        notifyFailure('Tạo phiếu thất bại. Vui lòng nhập người làm phiếu và chọn một dự án/kho cụ thể.');
        return;
    }

    const allowedItems = getInventoryItemsForTransactionProject(String(project.id));
    const remainingByStockId = new Map(allowedItems.map(item => [String(item.id), Math.max(0, Number(item.qty) || 0)]));
    const quantitiesByStockId = new Map();
    const newInventoryItems = [];
    const validationErrors = [];
    checked.forEach(cb => {
        const id = cb.value;
        const sourceItem = inventoryData.find(i => String(i.id) === String(id));
        const qtyInput = document.getElementById(`tx-qty-${id}`);
        const changeQty = Number(qtyInput?.value);

        if (!sourceItem) {
            validationErrors.push('Có linh kiện trong sheet không còn trong kho vật tư.');
        } else if (!Number.isInteger(changeQty) || changeQty < 1) {
            validationErrors.push(`Số lượng của "${sourceItem.name}" phải là số nguyên lớn hơn 0.`);
        } else {
            const sourceName = String(sourceItem.name || '').trim().toLocaleLowerCase('vi');
            const sourceType = sourceItem.type === 'tool' ? 'tool' : 'component';
            const candidates = allowedItems.filter(item =>
                String(item.name || '').trim().toLocaleLowerCase('vi') === sourceName &&
                (item.type === 'tool' ? 'tool' : 'component') === sourceType
            ).sort((left, right) => {
                const priority = item => {
                    if (String(item.projectId || '') === String(project.id)) return 0;
                    if (!item.projectId && String(item.projectName || '').trim().toLocaleLowerCase('vi') === project.name.toLocaleLowerCase('vi')) return 1;
                    if (!item.projectId && !String(item.projectName || '').trim()) return 2;
                    return 3;
                };
                return priority(left) - priority(right) ||
                    Number(String(right.id) === String(id)) - Number(String(left.id) === String(id));
            });

            if (type === 'IN') {
                let target = candidates.find(item =>
                    String(item.projectId || '') === String(project.id) ||
                    (!item.projectId && String(item.projectName || '').trim().toLocaleLowerCase('vi') === project.name.toLocaleLowerCase('vi'))
                );
                if (!target) {
                    target = newInventoryItems.find(item =>
                        String(item.name || '').trim().toLocaleLowerCase('vi') === sourceName &&
                        (item.type === 'tool' ? 'tool' : 'component') === sourceType
                    );
                }
                if (!target) {
                    let id = Date.now();
                    while ([...inventoryData, ...newInventoryItems].some(item => String(item.id) === String(id))) id++;
                    const projectId = String(project.id).startsWith('custom:') ? '' : String(project.id);
                    target = {
                        ...sourceItem,
                        id,
                        projectId,
                        projectName: project.name,
                        qty: 0
                    };
                    newInventoryItems.push(target);
                }
                quantitiesByStockId.set(String(target.id), (quantitiesByStockId.get(String(target.id)) || 0) + changeQty);
                return;
            }
            if (!candidates.length) {
                validationErrors.push(`"${sourceItem.name}" không có trong kho ${project.name} hoặc kho dùng chung.`);
                return;
            }

            let remaining = changeQty;
            candidates.forEach(target => {
                const stockId = String(target.id);
                const available = remainingByStockId.get(stockId) || 0;
                const allocated = Math.min(available, remaining);
                if (allocated > 0) {
                    quantitiesByStockId.set(stockId, (quantitiesByStockId.get(stockId) || 0) + allocated);
                    remainingByStockId.set(stockId, available - allocated);
                    remaining -= allocated;
                }
            });
            if (remaining > 0) {
                const availableTotal = candidates.reduce((sum, item) => sum + Math.max(0, Number(item.qty) || 0), 0);
                validationErrors.push(`"${sourceItem.name}" không đủ tồn kho ở ${project.name} và kho dùng chung (${availableTotal} hiện có, cần ${changeQty}).`);
            }
        }
    });

    if (validationErrors.length) {
        notifyFailure(`Lập phiếu thất bại. ${[...new Set(validationErrors)].join(' ')}`);
        return;
    }
    const transactionItems = [...quantitiesByStockId].map(([stockId, quantity]) => ({
        item: inventoryData.find(item => String(item.id) === stockId) ||
            newInventoryItems.find(item => String(item.id) === stockId),
        quantity
    })).filter(entry => entry.item);
    if (!transactionItems.length) {
        notifyFailure(`${type === 'IN' ? 'Nhập' : 'Xuất'} kho thất bại. Không có vật tư hợp lệ được chọn.`);
        return;
    }
    inventoryData.push(...newInventoryItems);

    const createdAt = new Date();
    const receiptNo = `PXN-${createdAt.getFullYear()}${String(createdAt.getMonth() + 1).padStart(2, '0')}${String(createdAt.getDate()).padStart(2, '0')}-${createdAt.getTime().toString().slice(-6)}`;
    const receipt = {
        receiptNo,
        type,
        createdAt,
        actor,
        projectName: project.name,
        reason,
        location,
        items: transactionItems.map(({ item, quantity }) => ({
            id: item.id,
            name: item.name,
            imgUrl: item.imgUrl || '',
            type: item.type === 'tool' ? 'Dụng cụ' : 'Linh kiện',
            projectName: getInventoryWarehouseName(item),
            unit: item.unit,
            quantity,
            price: Number(item.price) || 0,
            supplier: item.supplier || ''
        }))
    };
    const receiptHistoryNote = getTransactionReceiptHistoryNote(receipt);

    transactionItems.forEach(({ item, quantity }) => {
        item.qty = Number(item.qty) + (type === 'IN' ? quantity : -quantity);
        historyLogs.unshift({
            timestamp: createdAt.toLocaleDateString('vi-VN') + ' ' + createdAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
            type,
            name: item.name,
            qty: quantity,
            user: actor,
            note: receiptHistoryNote,
            receiptNo,
            project: project.name,
            location
        });
    });

    transactionReceipts.unshift(receipt);
    window.batchTxState = {};
    window.batchTxExcludedItems = {};
    saveStateToStorage();
    renderInventory();
    renderBatchTxSheet();
    renderHistory();
    renderTransactionReceipt(receipt);
    document.getElementById('transactionReceiptModal').classList.remove('hidden');

    notifySuccess(`${type === 'IN' ? 'Nhập' : 'Xuất'} kho thành công. Đã tạo phiếu ${receiptNo}.`);
}

function renderTransactionReceipt(receipt) {
    const setText = (id, value) => {
        document.getElementById(id).textContent = value;
    };
    const isIncoming = receipt.type === 'IN';
    setText('receiptTitle', `Phiếu ${isIncoming ? 'Nhập' : 'Xuất'} Kho`);
    setText('receiptNumber', receipt.receiptNo);
    setText('receiptDate', receipt.createdAt.toLocaleString('vi-VN'));
    setText('receiptActor', receipt.actor);
    setText('receiptProject', receipt.projectName);
    setText('receiptWarehouse', receipt.projectName === 'Tất cả'
        ? 'Nhiều kho (xem kho cụ thể theo từng dòng)'
        : `Kho dự án ${receipt.projectName} (bao gồm kho dùng chung)`);
    setText('receiptLocation', receipt.location);
    setText('receiptReason', receipt.reason);
    setText('receiptSignatureActor', receipt.actor);

    const tbody = document.getElementById('receiptItemsBody');
    tbody.innerHTML = '';
    let totalQuantity = 0;
    let totalAmount = 0;
    receipt.items.forEach((item, index) => {
        const lineAmount = item.quantity * item.price;
        totalQuantity += item.quantity;
        totalAmount += lineAmount;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td><img class="receipt-item-image" alt="${escapeHtml(item.name)}"></td>
            <td>${escapeHtml(item.name)}</td>
            <td>${escapeHtml(item.type)}</td>
            <td>${escapeHtml(item.projectName)}</td>
            <td>${escapeHtml(item.unit || '')}</td>
            <td class="text-right">${item.quantity.toLocaleString('vi-VN')}</td>
            <td class="text-right">${formatCurrency(item.price)}</td>
            <td class="text-right">${formatCurrency(lineAmount)}</td>
            <td>${renderSupplierLink(item.supplier)}</td>
        `;
        const image = row.querySelector('.receipt-item-image');
        image.src = item.imgUrl || DEFAULT_IMG;
        image.addEventListener('error', () => {
            image.onerror = null;
            image.src = DEFAULT_IMG;
        }, { once: true });
        tbody.appendChild(row);
    });
    setText('receiptLineCount', receipt.items.length.toLocaleString('vi-VN'));
    setText('receiptTotalQuantity', totalQuantity.toLocaleString('vi-VN'));
    setText('receiptTotalAmount', formatCurrency(totalAmount));
}

function openSavedTransactionReceipt(receiptNo) {
    const receipt = transactionReceipts.find(item => item.receiptNo === receiptNo);
    if (!receipt) {
        notifyFailure('Không thể mở phiếu. Không tìm thấy dữ liệu phiếu trong lịch sử.');
        return;
    }
    renderTransactionReceipt({ ...receipt, createdAt: new Date(receipt.createdAt) });
    document.getElementById('transactionReceiptModal').classList.remove('hidden');
}

function closeTransactionReceipt() {
    document.getElementById('transactionReceiptModal').classList.add('hidden');
}

function printTransactionReceipt() {
    document.body.classList.add('receipt-printing');
    try {
        window.print();
    } finally {
        document.body.classList.remove('receipt-printing');
    }
}
// ================= TAB 4: DANH SÁCH MUA HÀNG =================
function renderProcurement() {
    const tbody = document.getElementById('procurementTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    let grandTotal = 0;

    procurementList.forEach((pItem, index) => {
        const comp = inventoryData.find(i => i.id === pItem.componentId);
        const name = comp ? comp.name : 'Linh kiện chưa xác định';
        const unit = comp ? comp.unit : 'pcs';
        const currentStock = comp ? comp.qty : 0;
        const supplier = comp ? comp.supplier : '';
        const imgUrl = comp ? comp.imgUrl : DEFAULT_IMG;

        const rowTotal = pItem.qtyToBuy * pItem.price;
        grandTotal += rowTotal;

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50";
        tr.innerHTML = `
            <td class="py-3 px-4 text-center text-slate-400 font-medium">${index + 1}</td>
            <td class="py-3 px-4"><img src="${imgUrl || DEFAULT_IMG}" class="w-8 h-8 rounded border object-cover"></td>
            <td class="py-3 px-4 font-semibold text-slate-800">${escapeHtml(name)}</td>
            <td class="py-3 px-4 text-center text-slate-500">${escapeHtml(unit)}</td>
            <td class="py-3 px-4 text-right font-medium text-slate-600">${currentStock}</td>
            <td class="py-3 px-4 text-center">
                <input type="number" min="1" value="${pItem.qtyToBuy}" onchange="updateProcurementQty(${pItem.componentId}, this.value)" class="w-20 p-1.5 border border-slate-200 rounded text-center font-bold">
            </td>
            <td class="py-3 px-4 text-right">
                <input type="text" value="${formatNumber(pItem.price)}" oninput="formatInputCurrency(this)" onchange="updateProcurementPrice(${pItem.componentId}, this.value)" class="w-28 p-1.5 border border-slate-200 rounded text-right">
            </td>
            <td class="py-3 px-4 text-right font-bold text-brand-600">${formatCurrency(rowTotal)}</td>
            <td class="py-3 px-4">${renderSupplierLink(supplier)}</td>
            <td class="py-3 px-4 text-center no-print">
                <button onclick="removeProcurementItem(${pItem.componentId})" class="text-slate-400 hover:text-red-600 p-1"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const grandTotalElem = document.getElementById('procurementGrandTotal');
    if (grandTotalElem) grandTotalElem.textContent = formatCurrency(grandTotal);
}

function updateProcurementQty(compId, val) {
    const item = procurementList.find(p => p.componentId === compId);
    if (item) {
        item.qtyToBuy = Math.max(1, parseInt(val) || 1);
        saveStateToStorage();
        renderProcurement();
        notifySuccess('Cập nhật số lượng cần mua thành công.');
    }
}

function updateProcurementPrice(compId, val) {
    const item = procurementList.find(p => p.componentId === compId);
    if (item) {
        item.price = parseCurrencyNumber(val);
        saveStateToStorage();
        renderProcurement();
        notifySuccess('Cập nhật đơn giá thành công.');
    }
}

function removeProcurementItem(compId) {
    procurementList = procurementList.filter(p => p.componentId !== compId);
    saveStateToStorage();
    renderProcurement();
    notifySuccess('Xóa vật tư khỏi danh sách mua thành công.');
}

// ================= MODAL TAB 4: CHỌN VẬT TƯ / SẢN PHẨM CHO DANH SÁCH MUA =================
let procurementPickerType = 'component';

function openSelectFromInventoryModal() {
    setProcurementPickerType('component');
    const searchInput = document.getElementById('pickerSearchInput');
    if (searchInput) searchInput.value = '';
    const categoryFilter = document.getElementById('pickerCategoryFilter');
    if (categoryFilter) categoryFilter.value = 'all';
    renderPickerList();
    document.getElementById('selectToProcurementModal').classList.remove('hidden');
}

function closeSelectFromInventoryModal() {
    document.getElementById('selectToProcurementModal').classList.add('hidden');
}

function setProcurementPickerType(type) {
    procurementPickerType = type;

    const componentTab = document.getElementById('procurementPickerComponentsTab');
    const productTab = document.getElementById('procurementPickerProductsTab');
    if (componentTab && productTab) {
        componentTab.className = type === 'component'
            ? 'px-3 py-2 rounded-lg text-xs font-semibold bg-white text-brand-700 shadow-sm transition'
            : 'px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-800 transition';
        productTab.className = type === 'bom'
            ? 'px-3 py-2 rounded-lg text-xs font-semibold bg-white text-brand-700 shadow-sm transition'
            : 'px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-800 transition';
    }

    const title = document.getElementById('procurementPickerTitle');
    const searchInput = document.getElementById('pickerSearchInput');
    const categoryFilterWrap = document.getElementById('pickerCategoryFilterWrap');
    if (categoryFilterWrap) categoryFilterWrap.classList.toggle('hidden', type !== 'component');
    if (title) {
        const titleText = type === 'component'
            ? 'Chọn linh kiện từ Kho vào Danh sách mua'
            : 'Chọn sản phẩm BOM vào Danh sách mua';
        title.textContent = translateUiValue(titleText) || titleText;
    }
    if (searchInput) {
        const placeholder = type === 'component'
            ? 'Tìm tên linh kiện trong kho...'
            : 'Tìm tên sản phẩm BOM...';
        searchInput.placeholder = translateUiValue(placeholder) || placeholder;
    }

    renderPickerList();
}

function renderPickerList() {
    const tbody = document.getElementById('pickerTableBody');
    if (!tbody) return;
    const tableHead = document.getElementById('procurementPickerTableHead');
    if (tableHead) {
        tableHead.innerHTML = procurementPickerType === 'component'
            ? `<tr>
                    <th class="py-2.5 px-3 w-8 text-center">Chọn</th>
                    <th class="py-2.5 px-3">Tên Linh Kiện</th>
                    <th class="py-2.5 px-3 text-right">Tồn Kho</th>
                    <th class="py-2.5 px-3 w-28 text-center">SL Cần Mua</th>
                </tr>`
            : `<tr>
                    <th class="py-2.5 px-3 w-8 text-center">Chọn</th>
                    <th class="py-2.5 px-3">Tên Sản Phẩm</th>
                    <th class="py-2.5 px-3 text-right">Số Cấu Phần</th>
                    <th class="py-2.5 px-3 w-28 text-center">Số Sản Phẩm</th>
                </tr>`;
    }

    const searchInput = document.getElementById('pickerSearchInput');
    const search = searchInput ? searchInput.value.trim().toLocaleLowerCase() : '';
    const category = document.getElementById('pickerCategoryFilter')?.value || 'all';
    tbody.innerHTML = '';

    if (procurementPickerType === 'component') {
        getFilteredInventoryComponents(search, category).forEach(item => {

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="py-2 px-3 text-center">
                    <input type="checkbox" value="${item.id}" class="picker-checkbox rounded border-slate-300 text-brand-600">
                </td>
                <td class="py-2 px-3 font-semibold text-slate-800">${escapeHtml(item.name)}</td>
                <td class="py-2 px-3 text-right font-medium">${item.qty}</td>
                <td class="py-2 px-3 text-center">
                    <input type="number" id="picker-qty-${item.id}" min="1" value="10" class="w-20 p-1 border border-slate-200 rounded text-center">
                </td>
            `;
            tbody.appendChild(tr);
        });
    } else {
        bomProducts.filter(product => product.items.length > 0).forEach(product => {
            if (!product.name.toLocaleLowerCase().includes(search)) return;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="py-2 px-3 text-center">
                    <input type="checkbox" value="${product.id}" class="picker-bom-checkbox rounded border-slate-300 text-brand-600">
                </td>
                <td class="py-2 px-3 font-semibold text-slate-800">${escapeHtml(product.name)}</td>
                <td class="py-2 px-3 text-right font-medium">${product.items.length}</td>
                <td class="py-2 px-3 text-center">
                    <input type="number" id="picker-bom-qty-${product.id}" min="1" value="1" class="w-20 p-1 border border-slate-200 rounded text-center">
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    if (tbody.children.length === 0) {
        const emptyMessage = procurementPickerType === 'component'
            ? 'Không tìm thấy linh kiện phù hợp.'
            : 'Chưa có sản phẩm nào được cấu hình BOM phù hợp.';
        tbody.innerHTML = `<tr><td colspan="4" class="py-5 px-3 text-center text-slate-500">${emptyMessage}</td></tr>`;
    }
}

function confirmAddPickerToProcurement() {
    const selector = procurementPickerType === 'component' ? '.picker-checkbox:checked' : '.picker-bom-checkbox:checked';
    const checked = document.querySelectorAll(selector);
    if (checked.length === 0) {
        notifyFailure(procurementPickerType === 'component'
            ? 'Thêm vào danh sách mua thất bại. Vui lòng chọn ít nhất 1 linh kiện.'
            : 'Thêm vào danh sách mua thất bại. Vui lòng chọn ít nhất 1 sản phẩm BOM.');
        return;
    }

    checked.forEach(cb => {
        const id = parseInt(cb.value);
        if (procurementPickerType === 'component') {
            const qtyInput = document.getElementById(`picker-qty-${id}`);
            const buyQty = Math.max(1, parseInt(qtyInput ? qtyInput.value : '1') || 1);
            addComponentToProcurement(id, buyQty);
            return;
        }

        const product = bomProducts.find(item => item.id === id);
        const qtyInput = document.getElementById(`picker-bom-qty-${id}`);
        const multiplier = Math.max(1, parseInt(qtyInput ? qtyInput.value : '1') || 1);
        if (!product) return;

        product.items.forEach(item => {
            addComponentToProcurement(item.componentId, item.qtyRequired * multiplier);
        });
    });

    saveStateToStorage();
    renderProcurement();
    closeSelectFromInventoryModal();
    notifySuccess(`Thêm ${checked.length} lựa chọn vào danh sách mua thành công.`);
}

function addComponentToProcurement(componentId, quantity) {
    const existing = procurementList.find(item => String(item.componentId) === String(componentId));
    if (existing) {
        existing.qtyToBuy += quantity;
        return;
    }

    const component = inventoryData.find(item => String(item.id) === String(componentId));
    procurementList.push({
        componentId,
        qtyToBuy: quantity,
        price: component ? component.price : 0
    });
}

// ================= TAB 5: LỊCH SỬ GIAO DỊCH =================
function addHistoryLog(type, name, qty, note) {
    const now = new Date();
    const timeStr = now.toLocaleDateString('vi-VN') + ' ' + now.toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'});
    historyLogs.unshift({
        timestamp: timeStr,
        type,
        name,
        qty,
        user: 'Admin',
        note
    });
    saveStateToStorage();
    renderHistory();
}

function getTransactionReceiptHistoryNote(receipt) {
    const itemDetails = (receipt.items || []).map(item =>
        `${item.name} - ${Number(item.quantity) || 0} ${item.unit || ''} - Kho: ${item.projectName || 'Dùng chung'}`
    );
    return [`Lý do: ${receipt.reason || '-'}`, ...itemDetails].join('\n');
}

function renderHistory() {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const query = document.getElementById('historySearchInput')?.value.trim().toLocaleLowerCase('vi') || '';
    const typeFilter = document.getElementById('historyTypeFilter')?.value || 'all';
    const filteredLogs = historyLogs.filter(log => {
        const typeMatches = typeFilter === 'all' || log.type === typeFilter;
        const receipt = log.receiptNo
            ? transactionReceipts.find(item => item.receiptNo === log.receiptNo)
            : null;
        const note = receipt ? getTransactionReceiptHistoryNote(receipt) : (log.note || '');
        const searchableText = [
            log.receiptNo || '',
            log.project || '',
            log.user || 'Admin',
            note
        ].join(' ').toLocaleLowerCase('vi');
        return typeMatches && (!query || searchableText.includes(query));
    });

    filteredLogs.forEach(log => {
        const receipt = log.receiptNo
            ? transactionReceipts.find(item => item.receiptNo === log.receiptNo)
            : null;
        const note = receipt ? getTransactionReceiptHistoryNote(receipt) : (log.note || '-');
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="py-3 px-4 text-slate-500">${log.timestamp}</td>
            <td class="py-3 px-4">
                <span class="px-2 py-0.5 rounded text-[11px] font-bold ${log.type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
                    ${log.type === 'IN' ? 'Nhập Kho' : 'Xuất Kho'}
                </span>
            </td>
            <td class="py-3 px-4 font-semibold text-slate-800">${escapeHtml(log.name)}</td>
            <td class="py-3 px-4 text-slate-600">${log.receiptNo
                ? `<button type="button" onclick="openSavedTransactionReceipt('${escapeHtml(log.receiptNo)}')" class="font-semibold text-brand-600 hover:underline">${escapeHtml(log.receiptNo)}</button>`
                : '-'}</td>
            <td class="py-3 px-4 text-slate-600">${escapeHtml(log.project || '-')}</td>
            <td class="py-3 px-4 text-right font-bold">${log.qty}</td>
            <td class="py-3 px-4 text-slate-600">${escapeHtml(log.user || 'Admin')}</td>
            <td class="history-note-cell py-3 px-4 text-slate-500"><div class="history-note">${escapeHtml(note)}</div></td>
        `;
        tbody.appendChild(tr);
    });

    const emptyState = document.getElementById('historyEmptyState');
    if (emptyState) emptyState.classList.toggle('hidden', filteredLogs.length > 0);
}

function clearHistoryLogs() {
    if (confirm("Xóa toàn bộ lịch sử giao dịch?")) {
        historyLogs = [];
        transactionReceipts = [];
        saveStateToStorage();
        renderHistory();
        notifySuccess('Xóa lịch sử giao dịch thành công.');
    }
}

// ================= TIỆN ÍCH ĐỊNH DẠNG SỐ, TIỀN VÀ DỮ LIỆU NHẬP =================
function formatNumber(num) {
    if (!num && num !== 0) return '';
    return new Intl.NumberFormat('en-US').format(num);
}

function formatCurrency(val) {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        maximumFractionDigits: 6
    }).format(val || 0);
}

function parseCurrencyNumber(str) {
    if (typeof str === 'number') return str;
    if (!str) return 0;
    return parseFloat(str.replace(/,/g, '')) || 0;
}

function formatInputCurrency(input) {
    let val = input.value.replace(/[^0-9]/g, '');
    if (val === '') {
        input.value = '';
        return;
    }
    input.value = new Intl.NumberFormat('en-US').format(parseInt(val));
}

function updateDataLists() {
    const nameDatalist = document.getElementById('componentNameSuggestions');
    if (!nameDatalist) return;
    nameDatalist.innerHTML = '';
    inventoryData.forEach(item => {
        nameDatalist.innerHTML += `<option value="${escapeHtml(item.name)}"></option>`;
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function setupBackdropClick() {
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-backdrop')) {
            closeComponentModal();
            closeBOMModal();
            closeSelectFromInventoryModal();
        }
        if (e.target.id === 'transactionComponentPickerModal') closeTransactionComponentPicker();
        if (e.target.id === 'inventoryImportModal') closeInventoryImportModal();
        if (e.target.id === 'productExportModal') closeProductExportModal();
        if (e.target.id === 'transactionReceiptModal') closeTransactionReceipt();
        if (['guideContentEditorModal', 'todoEditorModal', 'noteEditorModal'].includes(e.target.id)) {
            closeWorkspaceEditor(e.target.id);
        }
    });
}

async function toggleAuthModal() {
    if (!supabaseClient) {
        notifyFailure('Không thể đăng xuất vì dịch vụ đăng nhập chưa sẵn sàng.');
        return;
    }
    try {
        window.clearTimeout(workspaceSyncTimer);
        workspaceSyncTimer = null;
        pendingWorkspaceStorageKeys.clear();
        await workspaceSyncQueue;
        await persistWorkspacePatch(SHARED_WORKSPACE_STORAGE_KEYS);
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        handleAuthenticatedSignOut();
    } catch (error) {
        notifyFailure(`Không thể đăng xuất hoặc đồng bộ dữ liệu cuối cùng: ${error.message}`);
    }
}

// ================= XUẤT TỆP VÀ IN DỮ LIỆU =================
function exportInventoryExcel() {
    let csv = "\uFEFFSTT,Tên Vật Tư,Loại,Dự Án,Đơn Vị,Tồn Kho,Đơn Giá,Cửa Hàng,Ngày Mua\n";
    inventoryData.forEach((item, idx) => {
        const project = workspaceProjects.find(projectItem => String(projectItem.id) === String(item.projectId));
        const type = item.type === 'tool' ? 'Dụng cụ' : 'Linh kiện';
        const escapedName = String(item.name || '').replace(/"/g, '""');
        const escapedProject = String(project?.name || item.projectName || '').replace(/"/g, '""');
        const escapedSupplier = String(item.supplier || '').replace(/"/g, '""');
        csv += `${idx + 1},"${escapedName}","${type}","${escapedProject}","${item.unit}","${item.qty}",${item.price},"${escapedSupplier}","${item.date || ''}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Kho_Linh_Kien_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notifySuccess('Xuất danh sách kho vật tư thành công.');
}

function exportProcurementExcel() {
    let csv = "\uFEFFSTT,Tên Linh Kiện,Đơn Vị,Số Lượng Cần Mua,Đơn Giá,Thành Tiền,Link Mua\n";
    procurementList.forEach((p, idx) => {
        const comp = inventoryData.find(i => i.id === p.componentId);
        const name = comp ? comp.name : '';
        const unit = comp ? comp.unit : '';
        const total = p.qtyToBuy * p.price;
        csv += `${idx + 1},"${name}","${unit}",${p.qtyToBuy},${p.price},${total},"${comp ? comp.supplier : ''}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Danh_Sach_Mua_Hang_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notifySuccess('Xuất danh sách mua hàng thành công.');
}

function exportPDF(sectionId) {
    window.print();
    notifySuccess('Đã mở chức năng in hoặc lưu PDF.');
}
