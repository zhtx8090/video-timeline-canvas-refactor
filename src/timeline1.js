Date.prototype.format = function(fmt) {
    let o = {
        "M+": this.getMonth() + 1, //月份
        "d+": this.getDate(), //日
        "h+": this.getHours(), //小时
        "m+": this.getMinutes(), //分
        "s+": this.getSeconds(), //秒
        "q+": Math.floor((this.getMonth() + 3) / 3), //季度
        S: this.getMilliseconds() //毫秒
    };
    if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
    for (let k in o)
        if (new RegExp("(" + k + ")").test(fmt))
            fmt = fmt.replace(RegExp.$1, RegExp.$1.length == 1 ? o[k] : ("00" + o[k]).substr(("" + o[k]).length));
    return fmt;
};

const TimeLine = class TimeLine {
    constructor(
        canvasId,
        currentTime = new Date().getTime(),
        timeParts = [],
        isMove = false,
        infiniteRolling = false,
        changeCallback = date => {}
    ) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext("2d");

        // 可选的每个间隔代表多少分钟
        this.minutePerStep = [1, 5, 10, 15, 30, 60, 120];
        // 最小刻度间距
        this.minScaleSpacing = 20;
        // 整个时间轴表示的时间长度
        this.totalRulerHours = 24;
        // 缩放层级
        this.zoom = 24;
        // 允许的最小大格长度px值 如果调小 大格会变密集
        this.minLargeScaleSpacing = 80;


        this.currentTime = currentTime;
        this.currentTimePos = 0;
        this.defaultLeftTime = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
        this.startTimestamp = this.defaultLeftTime;
        this.leftHandTime = this.defaultLeftTime;
        this.timeParts = timeParts;
        this.isMove = isMove;
        this.infiniteRolling = infiniteRolling,
        this.moveTimer = null;
        this.changeCallback = changeCallback;

        this.init();
        // 定时移动光标
        // this.autoMoveCursor(isMove);

        /* *****************
            ## 事件处理
        ***************** */
        // 鼠标是否被按下 用来确认时hover事件还是拖拽事件
        this.isMouseDownFlag = false;
        // 是否拖拽 用来确认mouseup时是点击事件还是拖拽事件
        this.isDragFlag = false;
        // 是否已缩放，用来赋值时间轴开始时间
        this.hasWheel = false;
        // 鼠标按下时鼠标x位置 在处理拖拽事件中用来比对
        this.mousedownX = 0;

        const _this = this;
        this.eventListener = {
            click(event) {
                // 游标移动
                _this.clickEvent(event);
            },
            wheel(event) {
                // 事件this指向DOM元素
                _this.wheelEvent(event);
                // _this.hoverMove(event);
            },
            mousedown(event) {
                _this.isMouseDownFlag = true;
                _this.mousedownX = _this.getMouseXRelativePos(event);
            },
            mousemove(event) {
                if (_this.isMouseDownFlag) {
                    _this.isDragFlag = true;
                    _this.dragMove(event);
                } else {
                    _this.hoverMove(event);
                }
            },
            mouseup(event) {
                if (!_this.isDragFlag) {
                    _this.clickEvent(event);
                    _this.hoverMove(event);
                }
                _this.changeCallback(new Date(_this.currentTime));
                // 初始化这俩值以免影响下次事件判断
                _this.isMouseDownFlag = false;
                _this.isDragFlag = false;
            },
            mouseleave(event) {
                _this.init();
                // 初始化这俩值以免影响下次事件判断
                _this.isMouseDownFlag = false;
                _this.isDragFlag = false;
            }
        };

        this.canvas.addEventListener("click", this.eventListener.click);
        this.canvas.addEventListener("wheel", this.eventListener.wheel);
        // this.canvas.addEventListener("mousedown", this.eventListener.mousedown);
        // this.canvas.addEventListener("mousemove", this.eventListener.mousemove);
        // this.canvas.addEventListener("mouseup", this.eventListener.mouseup);
        // this.canvas.addEventListener("mouseleave", this.eventListener.mouseleave);
    }
    init() {
        // this.refreshStartTimestamp();
        // 清空画布
        this.clearCanvas();
        // 画刻度处背景
        // this.fillScaleBg();
        // 画刻度
        this.drawScale();
        // 画游标
        this.drawCursor();
        // 画色块区间
        // if (this.timeParts.length) {
        //     this.timeParts.forEach(element => {
        //         this.fillTimeParts(element);
        //     });
        // }
    }
    fillScaleBg() {
        this.ctx.fillStyle = "rgba(69, 72, 76, 0.5)";
        this.ctx.fillRect(0, 0, this.canvas.width, 15);
    }
    fillTimeParts(part) {
        // 一个像素多少毫秒
        let onePxsMS = this.canvas.width / (this.totalRulerHours * 60 * 60 * 1000);
        let beginX = (part.start - this.defaultLeftTime) * onePxsMS;
        let partWidth = (part.end - part.start) * onePxsMS;
        if (part.style && part.style.background) {
            this.ctx.fillStyle = part.style.background;
        } else {
            this.ctx.fillStyle = "rgba(109, 153, 254, 0.6)";
        }
        this.ctx.fillRect(beginX, 0, partWidth, 15);
    }
    drawScale() {
        // 一分钟多少像素
        let oneMinutePx = this.canvas.width / (this.totalRulerHours * 60);
        // 一毫秒多少像素
        let oneMSPx = oneMinutePx / (60 * 1000);
        // 刻度间隔 默认20px
        let scaleSpacing = this.minScaleSpacing;
        // 每格代表多少分钟
        let scaleUnit = scaleSpacing / oneMinutePx;

        let len = this.minutePerStep.length;
        // 选择对应比例尺刻度间隔
        for (let i = 0; i < len; i += 1) {
            if (scaleUnit < this.minutePerStep[i]) {
                // 选择正确的刻度单位分钟
                scaleUnit = this.minutePerStep[i];
                // 每刻度之间的距离 = 一分钟多少像素 * 刻度单位
                // 即 scaleUnit = scaleSpacing / oneMinutePx 的变形
                // 主要是 this.totalRulerHours 会变化 需要根据这个的变化来计算...
                scaleSpacing = oneMinutePx * scaleUnit;
                break;
            }
        }

        // 有刻度文字的大格相当于多少分钟 相当于直尺上的1cm
        let mediumStep = 30;
        for (let i = 0; i < len; i++) {
            if (this.minLargeScaleSpacing / oneMinutePx <= this.minutePerStep[i]) {
                mediumStep = this.minutePerStep[i];
                break;
            }
        }
        // 缩放/距离可视区域左侧距离=>可视左侧时间=>可视刻度数=>渲染可视区域刻度尺
        // 拖拽/ 可视左侧时间跟当前点击位置时间对比确定向左向右移动=>重绘刻度尺=>记录当前左侧可视时间
        // 当前面板总宽度this.canvas.width，欲获取当前元素占页面宽度
        let totalScales = this.canvas.width / scaleSpacing;
        // 某个刻度距离最左端得距离
        let graduationLeft;
        // 某个刻度得时间
        let graduationTime;
        let lineHeight;
        // 一刻度多少毫秒
        let oneScalesMS = scaleSpacing / oneMSPx;
        // 当前时间距离左侧刻度数量
        let leftScales = Math.floor(this.getPosByTime(this.currentTime) / scaleSpacing);
        // TODO 当前左侧时间   算出当前最左侧时间,继而渲染刻度尺，当前存在oneScalesMS * leftScales为固定值的问题
        // 左侧 + 格数*单位 = 当前
        let currentLeftTime = new Date(this.currentTime - oneScalesMS * leftScales).getTime();
        console.log(new Date(currentLeftTime))
        let startTimestamp = this.hasWheel ? currentLeftTime : this.defaultLeftTime;
        // 文字颜色
        this.ctx.fillStyle = "rgba(151,158,167,1)";
        // 刻度线颜色
        this.ctx.strokeStyle = "rgba(151,158,167,1)";
        this.ctx.beginPath();
        // 画刻度线
        const _this = this;
        function drawScaleLine(left, height) {
            _this.ctx.moveTo(left, 0);
            _this.ctx.lineTo(left, height);
            _this.ctx.lineWidth = 1;
        }
        // for (let i = 0; i < totalScales; i++) {
        //     // 距离 = 开始得偏移距离 + 格数 * 每格得px;
        //     graduationLeft = i * scaleSpacing;
        //     // 时间 = 左侧开始时间 + 偏移时间 + 格数 * 一格多少毫秒
        //     // 本方案不可行：从最左侧开始绘制，跟可视区域无关联，所以时间线跟刻度尺没有联动效果，从而导致拖拽等功能也不可用
        //     graduationTime = startTimestamp  + i * oneScalesMS;
        //     let date = new Date(graduationTime);
        //     if ((graduationTime / (60 * 1000)) % mediumStep == 0) {
        //         // 大格刻度
        //         lineHeight = 15;
        //         let scaleText = this.createScaleText(date);
        //         this.ctx.fillText(scaleText, graduationLeft - 20, 30);
        //     } else {
        //         // 小格刻度
        //         lineHeight = 10;
        //     }
        //     drawScaleLine(graduationLeft, lineHeight);
        // }
        for (let i = 0; i < totalScales; i++) {
            // 距离 = 开始得偏移距离 + 格数 * 每格得px;
            graduationLeft = i * scaleSpacing;
            // 时间 = 左侧开始时间 + 偏移时间 + 格数 * 一格多少毫秒
            graduationTime = startTimestamp + i * oneScalesMS;
            // console.log(graduationLeft, new Date(graduationTime))
            let date = new Date(graduationTime);
            console.log('mediumStep',  graduationTime,(graduationTime / (60 * 1000)) % mediumStep, mediumStep, this.zoom)
            if ((graduationTime / (60 * 1000)) % mediumStep == 0) {
                // 大格刻度
                lineHeight = 15;
                let scaleText = this.createScaleText(date);
                this.ctx.fillText(scaleText, graduationLeft - 10, 30);
            } else {
                // 小格刻度
                let scaleText = this.createScaleText(date);
                this.ctx.fillText(scaleText, graduationLeft, 30);
                lineHeight = 10;
            }
            // if (this.zoom === 24) {
            //     if ()
            // }
            drawScaleLine(graduationLeft, lineHeight);
        }
        this.ctx.stroke();
    }
    drawCursor() {
        // 一毫秒多少像素
        let oneMSPx = this.canvas.width / (24 * 60 * 60 * 1000);
        // 某个刻度距离最左端得距离
        let graduationLeft = (this.currentTime - this.defaultLeftTime) * oneMSPx ;
        this.ctx.beginPath();
        this.ctx.moveTo(graduationLeft, 0);
        this.ctx.lineTo(graduationLeft, 35);
        this.ctx.strokeStyle = "rgb(64, 196, 255)";
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        this.ctx.fillStyle = "rgb(64, 196, 255)";
        this.ctx.fillText(
            new Date(this.currentTime).format("yyyy-MM-dd hh:mm:ss"),
            graduationLeft - 60,
            this.canvas.height - 20
        );
    }
    refreshStartTimestamp() {
        // 当currentTime改变或者整条时间轴代表的totalHours改变的时候 就刷新左边开始时间
        this.startTimestamp = this.currentTime - (this.totalRulerHours * 60 * 60 * 1000) / 2;
    }
    setTimeParts(timeParts) {
        this.timeParts = timeParts;
        this.uniqueTimeParts();
        this.init();
    }
    addTimeParts(timeParts) {
        this.setTimeParts(this.timeParts.concat(timeParts));
    }
    autoMoveCursor(isMove) {
        if (this.isMove === isMove) return;
        this.isMove = isMove;
        const clearTimer = () => {
            if (this.moveTimer) {
                clearInterval(this.moveTimer);
                this.moveTimer = null;
            }
        };
        if (isMove) {
            // 先清除之前得timer 否则会有两个timer通知进行...
            if (this.moveTimer) {
                clearTimer();
            }
            this.moveTimer = setInterval(() => {
                this.currentTime += 1000;
                this.init();
            }, 1000);
        } else {
            clearTimer();
        }
    }
    setChangeCallback(changeCallback) {
        this.changeCallback = changeCallback;
    }
    getCurrentTime() {
        return this.currentTime;
    }
    createScaleText(time) {
        return time.format("hh:mm");
    }
    dragMove(event) {
        let posX = this.getMouseXRelativePos(event);
        let diffX = posX - this.mousedownX;
        let onePxsMS = this.canvas.width / (this.totalRulerHours * 60 * 60 * 1000);

        this.currentTime = this.currentTime - Math.round(diffX / onePxsMS);
        this.init();
        // 👇因为重新设置了currentTime 所以要重新设置鼠标按下位置
        // 否则偏移时间会进行累加 越拖越快越拖越快...
        this.mousedownX = posX;
    }
    hoverMove(event) {
        let posX = this.getMouseXRelativePos(event);
        let time = this.getMousePosTime(event);
        this.init();
        this.ctx.beginPath();
        this.ctx.moveTo(posX + 1, 0);
        this.ctx.lineTo(posX + 1, this.canvas.height);
        this.ctx.strokeStyle = "rgb(194, 202, 215)";
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        this.ctx.fillStyle = "rgb(194, 202, 215)";
        this.ctx.fillText(time.format("yyyy-MM-dd hh:mm:ss"), posX - 50, this.canvas.height - 10);
    }
    // moveCursor(event) {
    //     let posX = this.getMouseXRelativePos(event);
    //     let time = this.getMousePosTime(event);
    //     this.init();
    //     this.ctx.beginPath();
    //     this.ctx.moveTo(posX + 1, 0);
    //     this.ctx.lineTo(posX + 1, this.canvas.height);
    //     this.ctx.strokeStyle = "rgb(64, 196, 255)";
    //     this.ctx.lineWidth = 1;
    //     this.ctx.stroke();
    //     this.ctx.fillStyle = "rgb(64, 196, 255)";
    //     this.ctx.fillText(time.format("yyyy-MM-dd hh:mm:ss"), posX - 60, this.canvas.height - 20);
    // }
    getMousePosTime(event) {
        let posX = this.getMouseXRelativePos(event);
        console.log('posX', posX, this.totalRulerHours)
        // 每像素多少毫秒
        let onePxsMS = this.canvas.width / (this.totalRulerHours * 60 * 60 * 1000);
        let time = new Date(this.defaultLeftTime + posX / onePxsMS);
        return time;
    }
    clickEvent(event) {
        let time = this.getMousePosTime(event).getTime();
        this.setCurrentTime(time);
    }
    wheelEvent(event) {
        event.preventDefault();
        // 是放大一倍还是缩小一倍
        let delta = Math.max(-1, Math.min(1, event.wheelDelta));
        if (delta < 0) {
            this.zoom = this.zoom + 4;
            if (this.zoom >= 24) {
                //放大最大24小时
                this.zoom = 24;
            }
            this.totalRulerHours = this.zoom;
        } else if (delta > 0) {
            // 放大
            this.zoom = this.zoom - 4;
            if (this.zoom <= 1) {
                //缩小最小1小时
                this.zoom = 1;
            }
            this.totalRulerHours = this.zoom;
        }
        this.hasWheel = true;
        this.init();
    }
    getMouseXRelativePos(event) {
        let scrollX = document.documentElement.scrollLeft || document.body.scrollLeft;
        let x = event.pageX || event.clientX + scrollX;
        // canvas元素距离窗口左侧距离
        let baseLeft = this.canvas.getBoundingClientRect().x;
        return x - baseLeft;
    }
    setCurrentTime(time) {
        let newTime;
        if (typeof time === "string") {
            newTime = new Date(time).getTime();
        } else if (typeof time === "object") {
            newTime = time.getTime && time.getTime();
        } else if (typeof time === "number") {
            newTime = time;
        }
        this.currentTime = newTime;
        this.init();
    }
    // 获取当前时间位置
    getPosByTime(currentTime) {
        const time = currentTime - this.defaultLeftTime;
        const pos = time / (24 * 60 * 60 * 1000) * this.canvas.width;
        this.currentTimePos = pos;
        return pos;
    }
    // 获取当前左侧时间
    getLeftTime() {
        // 每像素多少毫秒
        let onePxsMS = this.canvas.width / (this.totalRulerHours * 60 * 60 * 1000);
        let time = new Date(this.defaultLeftTime + posX / onePxsMS);
        return time;
    }
    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    getRaw() {
        return {
            currentTime: this.currentTime,
            timeParts: this.timeParts,
            isMove: this.isMove,
            changeCallback: this.changeCallback
        };
    }
    // 时间区间去重
    uniqueTimeParts() {
        let len = this.timeParts.length;
        if (len <= 1) return;
        this.timeParts.sort((a, b) => {
            return a.start - b.start;
        });
        for (let i = 1; i < len; i++) {
            const element = this.timeParts[i];
            const preElement = this.timeParts[i - 1];
            if (element.start === preElement.start && element.end === preElement.end) {
                element.isRepeat = true;
            }
        }
        this.timeParts = this.timeParts.filter(item => !item.isRepeat);
    }
    destroy() {
        /* 
            1. 解绑所有事件
            2. 清空画布
            3. 清除timer
        */
        this.canvas.removeEventListener("wheel", this.eventListener.wheel);
        this.canvas.removeEventListener("mousedown", this.eventListener.mousedown);
        this.canvas.removeEventListener("mousemove", this.eventListener.mousemove);
        this.canvas.removeEventListener("mouseup", this.eventListener.mouseup);
        this.canvas.removeEventListener("mouseleave", this.eventListener.mouseleave);
        this.clearCanvas();
        if (this.moveTimer) {
            clearInterval(this.moveTimer);
            this.moveTimer = null;
        }
    }
};