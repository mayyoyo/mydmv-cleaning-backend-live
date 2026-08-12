// ============================================================
// API CONFIGURATION
// ============================================================

const API =
window.location.hostname === "localhost" ||
window.location.hostname === "127.0.0.1"
?
"http://localhost:5000"
:
"https://mydmv-cleaning-backend-live.onrender.com";


let selectedDate = null;



// ============================================================
// CALENDAR
// ============================================================

document.addEventListener(
"DOMContentLoaded",
function(){


const calendarEl =
document.getElementById("calendar");


if(!calendarEl){
    return;
}



const calendar =
new FullCalendar.Calendar(
calendarEl,
{

initialView:
"dayGridMonth",


selectable:true,


dateClick:
async function(info){


selectedDate =
info.dateStr;



const selected =
document.getElementById(
"selectedDate"
);


if(selected){

selected.innerText =
"Selected: " + selectedDate;


selected.dataset.date =
selectedDate;

}



await loadTimeSlots(
selectedDate
);



}


});


calendar.render();


});






// ============================================================
// LOAD BOOKED TIME SLOTS
// ============================================================


async function loadTimeSlots(date){


try{


const response =
await fetch(

`${API}/api/booked-slots/${encodeURIComponent(date)}`

);



const data =
await response.json();



const bookedSlots =
data.bookedSlots || [];





const allSlots = [

"08:00-10:00",

"10:00-12:00",

"12:00-14:00",

"14:00-16:00",

"16:00-18:00"

];





const select =
document.getElementById(
"timeSlot"
);



if(!select){
    return;
}





select.innerHTML =

`
<option value="">
Select Time Slot
</option>
`;






allSlots.forEach(
slot=>{


const option =
document.createElement(
"option"
);



option.value =
slot;



option.textContent =
slot;




if(
bookedSlots.includes(slot)
){


option.disabled =
true;


option.style.color =
"red";


option.textContent =
slot +
" (Booked)";


}



select.appendChild(
option
);



});



}


catch(error){


console.log(
"TIME SLOT ERROR:",
error
);


}



}






// ============================================================
// GET BOOKING DATA
// ============================================================


function getBookingData(){


const service =
document.getElementById(
"service"
);



const price =
Number(
service.value
)
||
0;



const deposit =
Math.round(
price * 0.25 * 100
)
/
100;



const remaining =
Math.round(
(price - deposit) * 100
)
/
100;





return {


name:
document.getElementById(
"name"
).value.trim(),



email:
document.getElementById(
"email"
).value.trim(),



phone:
document.getElementById(
"phone"
).value.trim(),



address:
document.getElementById(
"address"
).value.trim(),



service:
service.options[
service.selectedIndex
]
?
service.options[
service.selectedIndex
].text
:
"",



price,

deposit,

remaining,



date:
selectedDate,



timeSlot:
document.getElementById(
"timeSlot"
).value


};


}






// ============================================================
// PAY NOW
// ============================================================


async function payNow(){


try{


const booking =
getBookingData();





if(!booking.date){

alert(
"Please select a date"
);

return;

}



if(!booking.timeSlot){

alert(
"Please select a time"
);

return;

}



if(!booking.name){

alert(
"Please enter your name"
);

return;

}



if(!booking.email){

alert(
"Please enter your email"
);

return;

}



if(!booking.phone){

alert(
"Please enter your phone number"
);

return;

}



if(!booking.address){

alert(
"Please enter your address"
);

return;

}



if(!booking.price){

alert(
"Please select a service"
);

return;

}



console.log(
"PAY NOW DATA:",
booking
);



const response =
await fetch(

`${API}/api/create-deposit-checkout`,

{

method:"POST",

headers:{

"Content-Type":
"application/json"

},

body:

JSON.stringify(
booking
)

}

);



const data =
await response.json();



console.log(
"STRIPE RESPONSE:",
data
);



if(!response.ok){

throw new Error(

data.message ||
"Stripe payment failed"

);

}



if(!data.checkoutUrl){

throw new Error(

"Stripe checkout URL missing"

);

}



window.location.href =
data.checkoutUrl;



}


catch(error){


console.log(
"PAY NOW ERROR:",
error
);



alert(
error.message
);



}



}
window.location.href =

"/success.html?booking_id="

+

encodeURIComponent(
data.bookingId
);